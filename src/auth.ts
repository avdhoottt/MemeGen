import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      name: "Password",
      credentials: {
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        // Check if password matches any valid password
        const validPasswords = [
          process.env.AUTH_PASSWORD,
          process.env.AUTH_PASSWORD_2,
        ].filter(Boolean);

        if (
          credentials?.password &&
          validPasswords.includes(credentials.password as string)
        ) {
          return {
            id: "1",
            name: "Admin",
            email: "admin@memegen.local",
          };
        }
        return null;
      },
    }),
  ],
  pages: {
    signIn: "/login",
  },
  callbacks: {
    authorized: async ({ auth }) => {
      return !!auth;
    },
  },
  trustHost: true,
});
