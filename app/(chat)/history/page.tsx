import { auth, currentUser } from "@clerk/nextjs/server";
import { SignInButton, SignUpButton } from "@clerk/nextjs";
import Link from "next/link";
import { MessageSquareIcon, ArrowLeftIcon, SearchIcon, ClockIcon } from "lucide-react";
import { getChatsByUserId } from "@/lib/db/queries"; // Assuming we have this query

export default async function HistoryPage() {
  const { userId } = await auth();
  const user = await currentUser();

  if (!userId) {
    return (
      <div className="absolute inset-0 z-50 bg-background flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-card rounded-3xl p-8 shadow-sm border border-border flex flex-col items-center text-center">
          <div className="size-16 bg-muted text-primary rounded-full flex items-center justify-center mb-6">
            <MessageSquareIcon className="size-8" />
          </div>
          <h2 className="text-2xl font-bold text-foreground mb-2">Save Your Conversations</h2>
          <p className="text-muted-foreground mb-8">
            Log in or create an account to securely save and revisit your previous chats, recipes, and discoveries.
          </p>
          <div className="flex flex-col w-full gap-3">
            <SignInButton mode="modal">
              <button className="w-full bg-primary text-primary-foreground font-medium h-12 rounded-xl hover:bg-primary/90 transition-colors">
                Sign In
              </button>
            </SignInButton>
            <SignUpButton mode="modal">
              <button className="w-full bg-transparent text-primary font-medium h-12 rounded-xl border-2 border-primary hover:bg-muted transition-colors">
                Create Account
              </button>
            </SignUpButton>
          </div>
        </div>
      </div>
    );
  }

  // Fetch all chats
  const chatResponse = await getChatsByUserId({ 
    id: userId,
    limit: 50,
    startingAfter: null,
    endingBefore: null
  });
  const allChats = chatResponse.chats;

  return (
    <div className="absolute inset-0 z-50 bg-background flex flex-col overflow-hidden">
      <header className="h-16 shrink-0 flex items-center px-4 md:px-8 border-b border-border bg-card sticky top-0 z-10">
        <Link href="/" className="flex items-center text-primary hover:text-primary/80 transition-colors mr-6">
          <ArrowLeftIcon className="size-5 mr-2" />
          <span className="font-medium">Back to Chat</span>
        </Link>
        <h1 className="text-lg font-bold text-foreground">All Chats</h1>
      </header>

      <div className="flex-1 overflow-y-auto p-4 md:p-8">
        <div className="max-w-4xl mx-auto">
          {allChats && allChats.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {allChats.map((chat) => (
                <Link key={chat.id} href={`/chat/${chat.id}`}>
                  <div className="bg-card rounded-2xl p-5 border border-border hover:shadow-md hover:border-primary transition-all cursor-pointer group h-[140px] flex flex-col justify-between">
                    <div>
                      <h3 className="font-semibold text-foreground mb-2 line-clamp-2 group-hover:text-primary transition-colors">
                        {chat.title || "Untitled Conversation"}
                      </h3>
                    </div>
                    <div className="flex items-center text-xs text-muted-foreground gap-4">
                      <div className="flex items-center">
                        <ClockIcon className="size-3 mr-1 opacity-70" />
                        {new Date(chat.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="size-16 bg-card border border-border text-muted-foreground rounded-2xl flex items-center justify-center mb-4 shadow-sm">
                <SearchIcon className="size-8 opacity-50" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-1">No chats yet</h3>
              <p className="text-muted-foreground">Start a new conversation and it will appear here.</p>
              <Link href="/">
                <button className="mt-6 bg-primary text-primary-foreground font-medium px-6 py-2.5 rounded-xl hover:bg-primary/90 transition-colors">
                  Start Chatting
                </button>
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
