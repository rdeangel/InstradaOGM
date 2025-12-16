import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth"; // Import from the new location

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };