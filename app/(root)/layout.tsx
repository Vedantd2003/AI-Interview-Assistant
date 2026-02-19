import Link from "next/link";
import Image from "next/image";
import { ReactNode } from "react";
import { redirect } from "next/navigation";

import { getCurrentUser, signOut } from "@/lib/actions/auth.action";
import { Button } from "@/components/ui/button";

const Layout = async ({ children }: { children: ReactNode }) => {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  const handleSignOut = async () => {
    "use server";
    await signOut();
    redirect("/sign-in");
  };

  return (
    <div className="root-layout">
      <nav className="flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <Image src="/logo.svg" alt="MockMate Logo" width={38} height={32} />
          <h2 className="text-primary-100">PrepWise</h2>
        </Link>
        
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-600">{user.email}</span>
          <form action={handleSignOut}>
            <Button type="submit" variant="outline" className="text-sm">
              Sign Out
            </Button>
          </form>
        </div>
      </nav>

      {children}
    </div>
  );
};

export default Layout;
