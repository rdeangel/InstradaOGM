import { DefaultSession } from "next-auth";
import { Role } from "./opnsense"; // Import Role enum from your opnsense types

declare module "next-auth" {
  /**
   * Returned by `useSession`, `getSession` and received as a prop on the `SessionProvider` React Context
   */
  interface Session extends DefaultSession {
    user?: {
      id: string; // Add id to user
      name?: string | null; // DefaultSession has name, email, image. Keep for clarity.
      email?: string | null;
      image?: string | null;
      username?: string | null; // Add username to user
      role?: Role; // Add role to user
      authMethod?: string; // Add authMethod to user
      token?: string; // Add token to user (if needed, though usually JWT is enough)
      groups?: { id: string; name: string }[]; // Add groups to user
      externalGroups?: string[]; // Add externalGroups to Session user
    };
  }

  /**
   * The shape of the JWT used in the callbacks for session and JWT
   */
  interface JWT {
    id: string; // Add id to JWT
    username?: string | null; // Add username to JWT
    role: Role; // Add role to JWT
    authMethod?: string; // Add authMethod to JWT
    provider?: string; // Add provider to JWT for OIDC
    groups?: { id: string; name: string }[]; // Add groups to JWT
    externalGroups?: string[]; // Add externalGroups to JWT
  }
}

// If you are using the adapter, you might also need to extend the User type
// import { DefaultUser } from "next-auth";
// declare module "next-auth" {
//   interface User extends DefaultUser {
//     role?: Role;
//     is2FAEnabled?: boolean;
//     totpSecret?: string | null;
//     backupCodes?: string | null;
//   }
// }