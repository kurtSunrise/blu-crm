"use client";

import { Loader2, Monitor } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { authClient } from "@/lib/auth-client";

interface SessionRow {
  createdAt: string | Date;
  id: string;
  ipAddress?: string | null;
  token: string;
  userAgent?: string | null;
}

// A readable label from a raw user-agent string, e.g. "Chrome on macOS".
function describeDevice(userAgent?: string | null): string {
  if (!userAgent) {
    return "Unknown device";
  }
  let browser = "Browser";
  if (userAgent.includes("Edg")) {
    browser = "Edge";
  } else if (userAgent.includes("Chrome")) {
    browser = "Chrome";
  } else if (userAgent.includes("Firefox")) {
    browser = "Firefox";
  } else if (userAgent.includes("Safari")) {
    browser = "Safari";
  }

  let os = "device";
  if (userAgent.includes("iPhone") || userAgent.includes("iPad")) {
    os = "iOS";
  } else if (userAgent.includes("Android")) {
    os = "Android";
  } else if (userAgent.includes("Mac")) {
    os = "macOS";
  } else if (userAgent.includes("Windows")) {
    os = "Windows";
  } else if (userAgent.includes("Linux")) {
    os = "Linux";
  }

  return `${browser} on ${os}`;
}

const DATE_FORMAT: Intl.DateTimeFormatOptions = {
  day: "numeric",
  month: "short",
  year: "numeric",
};

export function SessionsDialog() {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [currentToken, setCurrentToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revokingToken, setRevokingToken] = useState<string | null>(null);

  const loadSessions = async () => {
    setIsLoading(true);
    setError(null);
    const [list, current] = await Promise.all([
      authClient.listSessions(),
      authClient.getSession(),
    ]);
    setIsLoading(false);

    if (list.error) {
      setError(list.error.message ?? "Could not load your sessions.");
      return;
    }
    setSessions((list.data ?? []) as SessionRow[]);
    setCurrentToken(current.data?.session.token ?? null);
  };

  const revoke = async (token: string) => {
    setRevokingToken(token);
    const { error: revokeError } = await authClient.revokeSession({ token });
    setRevokingToken(null);
    if (revokeError) {
      setError(revokeError.message ?? "Could not revoke that session.");
      return;
    }
    setSessions((prev) => prev.filter((item) => item.token !== token));
  };

  return (
    <Dialog
      onOpenChange={(open) => {
        if (open) {
          loadSessions();
        }
      }}
    >
      <DialogTrigger
        render={
          <Button className="h-10 px-4" type="button" variant="outline" />
        }
      >
        View Sessions
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogTitle>Active sessions</DialogTitle>
        <DialogDescription>
          Devices and browsers currently signed in to your account.
        </DialogDescription>

        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground text-sm">
            <Loader2 aria-hidden className="size-4 animate-spin" />
            Loading sessions…
          </div>
        ) : (
          <ul className="flex max-h-80 flex-col gap-2 overflow-y-auto">
            {sessions.map((item) => {
              const isCurrent = item.token === currentToken;
              return (
                <li
                  className="flex items-center gap-3 rounded-lg border p-3"
                  key={item.id}
                >
                  <Monitor
                    aria-hidden
                    className="size-5 shrink-0 text-muted-foreground"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm">
                      {describeDevice(item.userAgent)}
                      {isCurrent ? (
                        <span className="ml-2 text-blu text-xs">
                          This device
                        </span>
                      ) : null}
                    </p>
                    <p className="truncate text-muted-foreground text-xs">
                      Signed in{" "}
                      {new Date(item.createdAt).toLocaleDateString(
                        undefined,
                        DATE_FORMAT
                      )}
                      {item.ipAddress ? ` · ${item.ipAddress}` : ""}
                    </p>
                  </div>
                  {isCurrent ? null : (
                    <Button
                      className="h-9"
                      disabled={revokingToken === item.token}
                      onClick={() => revoke(item.token)}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      {revokingToken === item.token ? "Revoking…" : "Revoke"}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {error && (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
