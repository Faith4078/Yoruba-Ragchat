"use client";

import { SignInButton, SignUpButton, useClerk, useUser } from "@clerk/nextjs";
import { ChevronUp } from "lucide-react";
import { useTheme } from "next-themes";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { LoaderIcon } from "./icons";

type AppUser = { id: string; email?: string | null };

function emailToHue(email: string): number {
  let hash = 0;
  for (const char of email) {
    hash = char.charCodeAt(0) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % 360;
}

export function SidebarUserNav({ user }: { user?: AppUser }) {
  const { signOut } = useClerk();
  const { isLoaded, isSignedIn, user: clerkUser } = useUser();
  const { setTheme, resolvedTheme } = useTheme();

  const email =
    clerkUser?.primaryEmailAddress?.emailAddress ?? user?.email ?? "";

  if (!isLoaded) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton className="h-10 justify-between rounded-lg bg-transparent text-sidebar-foreground/50">
            <div className="flex flex-row items-center gap-2">
              <div className="size-6 animate-pulse rounded-full bg-sidebar-foreground/10" />
              <span className="animate-pulse rounded-md bg-sidebar-foreground/10 text-transparent text-[13px]">
                Loading...
              </span>
            </div>
            <div className="animate-spin text-sidebar-foreground/50">
              <LoaderIcon />
            </div>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    );
  }

  if (!isSignedIn) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <div className="flex flex-col gap-1.5">
            <SignInButton mode="modal">
              <SidebarMenuButton
                className="h-8 justify-center rounded-lg border border-sidebar-border text-[13px] text-sidebar-foreground/80 transition-colors duration-150 hover:text-sidebar-foreground"
                data-testid="sign-in-button"
              >
                Sign in
              </SidebarMenuButton>
            </SignInButton>
            <SignUpButton mode="modal">
              <SidebarMenuButton
                className="h-8 justify-center rounded-lg text-[13px] text-sidebar-foreground/70 transition-colors duration-150 hover:text-sidebar-foreground"
                data-testid="sign-up-button"
              >
                Create account
              </SidebarMenuButton>
            </SignUpButton>
          </div>
        </SidebarMenuItem>
      </SidebarMenu>
    );
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              className="h-8 px-2 rounded-lg bg-transparent text-sidebar-foreground/70 transition-colors duration-150 hover:text-sidebar-foreground data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
              data-testid="user-nav-button"
            >
              <div
                className="size-5 shrink-0 rounded-full ring-1 ring-sidebar-border/50"
                style={{
                  background: `linear-gradient(135deg, oklch(0.35 0.08 ${emailToHue(email)}), oklch(0.25 0.05 ${emailToHue(email) + 40}))`,
                }}
              />
              <span className="truncate text-[13px]" data-testid="user-email">
                {email || "Account"}
              </span>
              <ChevronUp className="ml-auto size-3.5 text-sidebar-foreground/50" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-popper-anchor-width) rounded-lg border border-border/60 bg-card/95 backdrop-blur-xl shadow-[var(--shadow-float)]"
            data-testid="user-nav-menu"
            side="top"
          >
            <DropdownMenuItem
              className="cursor-pointer text-[13px]"
              data-testid="user-nav-item-theme"
              onSelect={() =>
                setTheme(resolvedTheme === "dark" ? "light" : "dark")
              }
            >
              {`Toggle ${resolvedTheme === "light" ? "dark" : "light"} mode`}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild data-testid="user-nav-item-auth">
              <button
                className="w-full cursor-pointer text-[13px]"
                onClick={() => signOut({ redirectUrl: "/" })}
                type="button"
              >
                Sign out
              </button>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
