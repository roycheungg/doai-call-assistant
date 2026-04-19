import Anthropic from "@anthropic-ai/sdk";
import { execFile } from "child_process";
import { prisma } from "@/lib/prisma";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatOptions {
  organizationId?: string;
  allowCLI?: boolean;
}

/**
 * Build a WhatsApp system prompt for an org.
 *
 * Super-admins are expected to set a custom `whatsappSystemPrompt` per org
 * via the admin UI. If it's not set, we fall back to a minimal generic
 * prompt that just mentions the business name. (The old fallback used
 * businessDescription/services/operatingHours, but those have been removed.)
 */
export async function buildSystemPrompt(organizationId: string): Promise<string> {
  const settings = await prisma.organizationSettings.findUnique({
    where: { organizationId },
  });

  if (settings?.whatsappSystemPrompt) {
    return settings.whatsappSystemPrompt;
  }

  const businessName = settings?.businessName || "Our Business";

  return `You are a helpful WhatsApp assistant for ${businessName}.

Guidelines:
- Be friendly, professional, and concise (WhatsApp messages should be brief).
- Answer what you can. If you can't, say so honestly — don't make up information
  about pricing, availability, or services.
- If someone needs to speak to a person, let them know the team will follow up.
- Keep responses under 500 words.`;
}

// --- Claude Code CLI method (Max plan, local testing only) ---

function formatPromptForCLI(
  messages: ChatMessage[],
  systemPrompt: string
): string {
  const recentMessages = messages.slice(-30);
  const conversation = recentMessages
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n");

  return `${systemPrompt}

Conversation so far:
${conversation}

Respond to the last user message as the assistant. Be concise — this is a WhatsApp message.`;
}

async function getChatResponseCLI(
  messages: ChatMessage[],
  systemPrompt: string
): Promise<string> {
  const prompt = formatPromptForCLI(messages, systemPrompt);

  // On Windows, execFile doesn't resolve .exe/.cmd via PATHEXT unless shell is used.
  // Pass the explicit extension so the binary is found on both platforms.
  const binary = process.platform === "win32" ? "claude.exe" : "claude";

  return new Promise((resolve) => {
    execFile(
      binary,
      ["-p", "--output-format", "text", prompt],
      { timeout: 60_000, maxBuffer: 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          console.error("[CLAUDE CLI] Error:", error.message);
          if (stderr) console.error("[CLAUDE CLI] Stderr:", stderr);
          resolve(
            "Sorry, I was unable to generate a response right now. Please try again."
          );
          return;
        }
        const response = stdout.trim();
        resolve(response || "Sorry, I was unable to generate a response.");
      }
    );
  });
}

// --- Anthropic API method (production) ---

async function getChatResponseAPI(
  messages: ChatMessage[],
  systemPrompt: string,
  apiKey: string
): Promise<string> {
  const anthropic = new Anthropic({ apiKey });
  const recentMessages = messages.slice(-30);

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    system: systemPrompt,
    messages: recentMessages,
  });

  const textBlock = response.content.find((block) => block.type === "text");
  return textBlock?.text || "Sorry, I was unable to generate a response.";
}

// --- Public entry point: routes between API and CLI based on org config ---

export async function getChatResponse(
  messages: ChatMessage[],
  systemPrompt: string,
  options?: ChatOptions
): Promise<string> {
  // Per-org API key override (for enterprise clients)
  if (options?.organizationId) {
    const org = await prisma.organization.findUnique({
      where: { id: options.organizationId },
      select: { anthropicApiKeyOverride: true, slug: true },
    });

    if (org?.anthropicApiKeyOverride) {
      return getChatResponseAPI(messages, systemPrompt, org.anthropicApiKeyOverride);
    }

    // Claude CLI fallback - only allowed for the DOAI org and only if no shared key is set
    if (
      options.allowCLI &&
      org?.slug === "doai" &&
      !process.env.ANTHROPIC_API_KEY
    ) {
      return getChatResponseCLI(messages, systemPrompt);
    }
  }

  // Default: use the shared Anthropic API key
  if (process.env.ANTHROPIC_API_KEY) {
    return getChatResponseAPI(messages, systemPrompt, process.env.ANTHROPIC_API_KEY);
  }

  // Last-resort fallback
  if (options?.allowCLI) {
    return getChatResponseCLI(messages, systemPrompt);
  }

  return "Sorry, the AI service isn't configured yet. Please contact support.";
}
