import { clerkMiddleware } from "@clerk/nextjs/server";

export default clerkMiddleware({
  signInUrl: "/sign-in",
  authorizedParties: process.env.APP_URL ? [new URL(process.env.APP_URL).origin] : [],
});

export const config = {
  matcher: ["/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ico|woff2?|ttf)).*)", "/(api)(.*)"],
};
