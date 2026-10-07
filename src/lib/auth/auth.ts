import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

const adminEmail = process.env.AUTH_ADMIN_EMAIL;
const adminPassword = process.env.AUTH_ADMIN_PASSWORD;
const organizationId = process.env.AUTOPILOT_ORGANIZATION_ID;

if (!adminEmail || !adminPassword || !organizationId) {
  throw new Error(
    "Authentication environment is incomplete. Set AUTH_ADMIN_EMAIL, AUTH_ADMIN_PASSWORD, and AUTOPILOT_ORGANIZATION_ID."
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,

  session: {
    strategy: "jwt",
  },

  pages: {
    signIn: "/login",
  },

  providers: [
    Credentials({
      credentials: {
        email: {},
        password: {},
      },

      async authorize(credentials) {
        const email = String(credentials?.email ?? "").trim().toLowerCase();
        const password = String(credentials?.password ?? "");

        if (email !== adminEmail.toLowerCase()) {
          return null;
        }

        if (password !== adminPassword) {
          return null;
        }

        return {
          id: "admin",
          email: adminEmail,
          name: "Demo Commerce Admin",
          organizationId,
        };
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.organizationId = user.organizationId;
      }

      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.id = String(token.sub ?? "admin");
        session.user.organizationId = String(
          token.organizationId ?? ""
        );
      }

      return session;
    },
  },
});
