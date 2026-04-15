import Anthropic from "@anthropic-ai/sdk";
import { execFile } from "child_process";
import { prisma } from "@/lib/prisma";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export async function buildSystemPrompt(): Promise<string> {
  const settings = await prisma.businessSettings.findUnique({
    where: { id: "default" },
  });

  if (settings?.whatsappSystemPrompt) {
    return settings.whatsappSystemPrompt;
  }

  const businessName = settings?.businessName || "Our Business";
  const description = settings?.businessDescription || "";
  const services =
    (settings?.services as Array<{ name: string; description: string }>) || [];
  const hours = settings?.operatingHours as {
    start: string;
    end: string;
    days: number[];
  } | null;

  const serviceList =
    services.length > 0
      ? services.map((s) => `- ${s.name}: ${s.description}`).join("\n")
      : "General business inquiries";

  const hoursText =
    hours?.start && hours?.end
      ? `${hours.start} to ${hours.end}`
      : "Standard business hours";

  return `You are a helpful WhatsApp assistant for ${businessName}.
${description ? `\nAbout the business: ${description}` : ""}

Services offered:
${serviceList}

Operating hours: ${hoursText}

Guidelines:
- Be friendly, professional, and concise (WhatsApp messages should be brief)
- Help answer questions about the business and its services
- If someone needs to speak to a person, let them know the team will follow up
- If you cannot answer a question, say so honestly
- Do not make up information about pricing or availability unless specified above
- Keep responses under 500 words as these are WhatsApp messages`;
}

// --- Claude Code CLI method (uses Max plan subscription) ---

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

  return new Promise((resolve) => {
    execFile(
      "claude",
      ["-p", "--output-format", "text", prompt],
      { timeout: 60_000, maxBuffer: 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          console.error("[CLAUDE CLI] Error:", error.message);
          if (stderr) console.error("[CLAUDE CLI] Stderr:", stderr);
          resolve("Sorry, I was unable to generate a response right now. Please try again.");
          return;
        }
        const response = stdout.trim();
        resolve(response || "Sorry, I was unable to generate a response.");
      }
    );
  });
}

// --- Anthropic API method (uses API credits) ---

async function getChatResponseAPI(
  messages: ChatMessage[],
  systemPrompt: string
): Promise<string> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
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

// --- Public entry point: auto-selects CLI or API ---

export async function getChatResponse(
  messages: ChatMessage[],
  systemPrompt: string
): Promise<string> {
  if (process.env.ANTHROPIC_API_KEY) {
    return getChatResponseAPI(messages, systemPrompt);
  }
  return getChatResponseCLI(messages, systemPrompt);
}
