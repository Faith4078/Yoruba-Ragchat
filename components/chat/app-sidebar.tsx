"use client";

import {
  MessageSquareIcon,
  PanelLeftIcon,
  PenSquareIcon,
  SearchIcon,
  SettingsIcon,
  UserIcon,
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { useSWRConfig } from "swr";
import { unstable_serialize } from "swr/infinite";
import { useClerk } from "@clerk/nextjs";
import {
  getChatHistoryPaginationKey,
  SidebarHistory,
} from "@/components/chat/sidebar-history";
import { SidebarUserNav } from "@/components/chat/sidebar-user-nav";
import { SearchChatModal } from "@/components/chat/search-chat-modal";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

type AppUser = { id: string; email?: string | null };

export function AppSidebar({ user }: { user: AppUser | undefined }) {
  const router = useRouter();
  const { setOpenMobile, toggleSidebar, state, isMobile } = useSidebar();
  const { mutate } = useSWRConfig();
  const { openUserProfile } = useClerk();
  const [showDeleteAllDialog, setShowDeleteAllDialog] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  const isCollapsed = state === "collapsed" && !isMobile;

  const handleDeleteAll = () => {
    setShowDeleteAllDialog(false);
    router.replace("/");
    mutate(unstable_serialize(getChatHistoryPaginationKey), [], {
      revalidate: false,
    });

    fetch(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/history`, {
      method: "DELETE",
    });

    toast.success("All chats deleted");
  };

  return (
    <>
      <Sidebar collapsible="icon" className="bg-[#F9F6F0] border-r-0">
        <SidebarHeader className={`pt-6 pb-2 flex ${isCollapsed ? 'flex-col-reverse px-2' : 'flex-row px-4'} items-center justify-between gap-6 w-full`}>
          <div className="flex items-center justify-center">
            <Link href="/">
              {isCollapsed ? (
                <div className="size-12 relative flex items-center justify-center">
                  <Image
                    src="/logo-icon.png"
                    alt="Ilé Oúnjẹ Logo Icon"
                    fill
                    sizes="48px"
                    className="object-contain block dark:hidden"
                  />
                  <Image
                    src="/logo-icon-dark.png"
                    alt="Ilé Oúnjẹ Logo Icon"
                    fill
                    sizes="48px"
                    className="object-contain hidden dark:block"
                  />
                </div>
              ) : (
                <div className="relative flex items-center justify-start w-[180px] h-11">
                  <Image
                    src="/logo.png"
                    alt="Ilé Oúnjẹ Logo"
                    fill
                    sizes="180px"
                    className="object-contain object-left block dark:hidden"
                  />
                  <Image
                    src="/logo-dark.png"
                    alt="Ilé Oúnjẹ Logo"
                    fill
                    sizes="180px"
                    className="object-contain object-left hidden dark:block"
                  />
                </div>
              )}
            </Link>
          </div>

          <Tooltip>
            <TooltipTrigger asChild>
              <SidebarMenuButton
                className="size-10 flex items-center justify-center text-[#4A3522] hover:bg-[#7C5432]/10 transition-colors rounded-xl shrink-0"
                onClick={() => toggleSidebar()}
              >
                <PanelLeftIcon className="size-6" strokeWidth={2.5} />
              </SidebarMenuButton>
            </TooltipTrigger>
            <TooltipContent className="hidden md:block" side="right">
              Toggle sidebar
            </TooltipContent>
          </Tooltip>
        </SidebarHeader>

        <SidebarContent className="px-2 mt-4 flex flex-col gap-4 items-center">
          <SidebarMenu className="flex flex-col gap-4 w-full">
            <SidebarMenuItem>
              <Tooltip>
                <TooltipTrigger asChild>
                  <SidebarMenuButton
                    className="h-10 flex items-center justify-start text-[#4A3522] hover:bg-[#7C5432]/10 hover:text-[#4A3522] transition-colors rounded-xl font-medium"
                    onClick={() => {
                      setOpenMobile(false);
                      router.push("/");
                    }}
                  >
                    <div className="flex items-center justify-center w-8">
                      <PenSquareIcon className="size-6" strokeWidth={2.5} />
                    </div>
                    {!isCollapsed && <span className="ml-2">New Chat</span>}
                  </SidebarMenuButton>
                </TooltipTrigger>
                <TooltipContent className="hidden md:block" side="right">
                  New Chat
                </TooltipContent>
              </Tooltip>
            </SidebarMenuItem>

            <SidebarMenuItem>
              <Tooltip>
                <TooltipTrigger asChild>
                  <SidebarMenuButton
                    className="h-10 flex items-center justify-start text-[#4A3522] hover:bg-[#7C5432]/10 hover:text-[#4A3522] transition-colors rounded-xl font-medium"
                    onClick={() => setIsSearchOpen(true)}
                  >
                    <div className="flex items-center justify-center w-8">
                      <SearchIcon className="size-6" strokeWidth={2.5} />
                    </div>
                    {!isCollapsed && <span className="ml-2">Search</span>}
                  </SidebarMenuButton>
                </TooltipTrigger>
                <TooltipContent className="hidden md:block" side="right">
                  Search
                </TooltipContent>
              </Tooltip>
            </SidebarMenuItem>

            <SidebarMenuItem>
              <Tooltip>
                <TooltipTrigger asChild>
                  <SidebarMenuButton
                    className="h-10 flex items-center justify-start text-[#4A3522] hover:bg-[#7C5432]/10 hover:text-[#4A3522] transition-colors rounded-xl font-medium"
                    onClick={() => {
                      setOpenMobile(false);
                      router.push("/history");
                    }}
                  >
                    <div className="flex items-center justify-center w-8">
                      <MessageSquareIcon className="size-6" strokeWidth={2.5} />
                    </div>
                    {!isCollapsed && <span className="ml-2">All Chats</span>}
                  </SidebarMenuButton>
                </TooltipTrigger>
                <TooltipContent className="hidden md:block" side="right">
                  All Chats
                </TooltipContent>
              </Tooltip>
            </SidebarMenuItem>
          </SidebarMenu>

          {!isCollapsed && (
            <div className="w-full mt-4 flex-1 overflow-y-auto">
              <SidebarHistory user={user} />
            </div>
          )}
        </SidebarContent>

        <SidebarFooter className="pb-6 px-2 flex flex-col gap-4 items-center">
          <SidebarMenu className="flex flex-col gap-4 w-full">
            {user && (
              <SidebarMenuItem>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <SidebarMenuButton
                      className="h-10 flex items-center justify-start text-[#4A3522] hover:bg-[#7C5432]/10 hover:text-[#4A3522] transition-colors rounded-xl font-medium"
                      onClick={() => openUserProfile()}
                    >
                      <div className="flex items-center justify-center w-8">
                        <SettingsIcon className="size-6" strokeWidth={2.5} />
                      </div>
                      {!isCollapsed && <span className="ml-2">Settings</span>}
                    </SidebarMenuButton>
                  </TooltipTrigger>
                  <TooltipContent className="hidden md:block" side="right">
                    Settings
                  </TooltipContent>
                </Tooltip>
              </SidebarMenuItem>
            )}
          </SidebarMenu>
          
          <SidebarUserNav user={user} />
        </SidebarFooter>
      </Sidebar>

      <AlertDialog
        onOpenChange={setShowDeleteAllDialog}
        open={showDeleteAllDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete all chats?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete all
              your chats and remove them from our servers.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteAll}>
              Delete All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <SearchChatModal
        open={isSearchOpen}
        onOpenChange={setIsSearchOpen}
        user={user}
      />
    </>
  );
}
