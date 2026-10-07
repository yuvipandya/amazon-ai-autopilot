import "next-auth";

declare module "next-auth" {
  interface User {
    organizationId: string;
  }

  interface Session {
    user: {
      id: string;
      email?: string | null;
      name?: string | null;
      image?: string | null;
      organizationId: string;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    organizationId?: string;
  }
}
