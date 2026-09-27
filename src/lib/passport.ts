import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { findOrCreateGoogleManager } from "../services/auth-service.ts";

export function googleAuthConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_CALLBACK_URL,
  );
}

export function configurePassport(): void {
  if (!googleAuthConfigured()) {
    return;
  }

  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID ?? "",
        clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
        callbackURL: process.env.GOOGLE_CALLBACK_URL ?? "",
      },
      (accessToken, refreshToken, profile, done) => {
        void accessToken;
        void refreshToken;

        findOrCreateGoogleManager({
          googleId: profile.id,
          email: profile.emails?.[0]?.value,
          name: profile.displayName,
        })
          .then((user) => {
            done(null, user);
          })
          .catch((error: unknown) => {
            done(error);
          });
      },
    ),
  );
}
