import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Mail } from "lucide-react";

export default function CheckEmailPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0d1117] p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600/20 rounded-xl flex items-center justify-center">
              <Mail className="w-6 h-6 text-blue-400" />
            </div>
            <CardTitle className="text-xl">Check your inbox</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-slate-300">
          <p>We&apos;ve emailed you a login link.</p>
          <p className="text-muted-foreground">
            Click the link in the email to sign in. It will expire after 24 hours.
          </p>
          <p className="text-xs text-muted-foreground mt-6">
            Can&apos;t find it? Check your spam folder, or try again in a moment.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
