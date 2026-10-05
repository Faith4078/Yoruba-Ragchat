import { useState } from "react";
import { useRouter } from "next/navigation";
import useSWRInfinite from "swr/infinite";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { fetcher } from "@/lib/utils";
import { getChatHistoryPaginationKey, ChatHistory } from "@/components/chat/sidebar-history";
import { useSidebar } from "@/components/ui/sidebar";
import { MessageSquareIcon } from "lucide-react";

export function SearchChatModal({
  open,
  onOpenChange,
  user,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: any;
}) {
  const router = useRouter();
  const { setOpenMobile } = useSidebar();
  
  const { data: paginatedChatHistories } = useSWRInfinite<ChatHistory>(
    user ? getChatHistoryPaginationKey : () => null,
    fetcher,
    { fallbackData: [], revalidateOnFocus: false }
  );

  const chats = paginatedChatHistories
    ? paginatedChatHistories.flatMap((page) => page.chats)
    : [];

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search past chats..." />
      <CommandList>
        <CommandEmpty>No chats found.</CommandEmpty>
        <CommandGroup heading="Recent Chats">
          {chats.map((chat) => (
            <CommandItem
              key={chat.id}
              value={chat.title || "Untitled Chat"}
              onSelect={() => {
                onOpenChange(false);
                setOpenMobile(false);
                router.push(`/chat/${chat.id}`);
              }}
            >
              <MessageSquareIcon className="mr-2 h-4 w-4" />
              <span className="truncate">{chat.title || "Untitled Chat"}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
