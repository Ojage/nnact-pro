// NNACT Customer mobile app — service requests, portal links, estimates, and payments.
import { useCallback, useEffect, useState } from "react";
import { StatusBar } from "expo-status-bar";
import * as Linking from "expo-linking";
import { useTheme } from "./src/theme";
import { parsePortalToken } from "./src/api";
import { clearPortalToken, loadPortalToken, savePortalToken } from "./src/portal-storage";
import {
  clearCustomerSession,
  loadCustomerSession,
  saveCustomerSession,
  type StoredCustomerSession,
} from "./src/auth-storage";
import { customerLogout } from "./src/auth-api";
import { HomeScreen } from "./src/screens/HomeScreen";
import { LinkScreen } from "./src/screens/LinkScreen";
import { BookScreen } from "./src/screens/BookScreen";
import { PortalScreen } from "./src/screens/PortalScreen";
import { LoginScreen } from "./src/screens/LoginScreen";
import { SignupScreen } from "./src/screens/SignupScreen";

type Screen = "home" | "link" | "book" | "portal" | "login" | "signup";

export default function App() {
  const { colors, scheme } = useTheme();
  const [screen, setScreen] = useState<Screen>("home");
  const [portalToken, setPortalToken] = useState<string | null>(null);
  const [accountSession, setAccountSession] = useState<StoredCustomerSession | null>(null);
  const [portalMode, setPortalMode] = useState<"token" | "account">("token");
  const [booting, setBooting] = useState(true);

  const connectPortal = useCallback(async (token: string) => {
    await savePortalToken(token);
    setPortalToken(token);
    setPortalMode("token");
    setScreen("portal");
  }, []);

  const persistAccount = useCallback(async (session: StoredCustomerSession) => {
    await saveCustomerSession(session);
    setAccountSession(session);
  }, []);

  useEffect(() => {
    void (async () => {
      const [savedToken, savedAccount] = await Promise.all([loadPortalToken(), loadCustomerSession()]);
      setPortalToken(savedToken);
      setAccountSession(savedAccount);
      setBooting(false);
    })();
  }, []);

  useEffect(() => {
    function handleUrl(url: string | null) {
      if (!url) return;
      const parsed = Linking.parse(url);
      const tokenFromQuery = typeof parsed.queryParams?.token === "string" ? parsed.queryParams.token : null;
      const tokenFromPath = parsed.path?.startsWith("p/") ? parsed.path.slice(2) : parsed.path;
      const token = parsePortalToken(tokenFromQuery ?? tokenFromPath ?? url);
      if (token) void connectPortal(token);
      if (parsed.path === "portal" || parsed.hostname === "portal") {
        if (accountSession?.activeOrgId) {
          setPortalMode("account");
          setScreen("portal");
        }
      }
    }

    void Linking.getInitialURL().then(handleUrl);
    const sub = Linking.addEventListener("url", (event) => handleUrl(event.url));
    return () => sub.remove();
  }, [accountSession?.activeOrgId, connectPortal]);

  async function signOutPortal() {
    await clearPortalToken();
    setPortalToken(null);
    setScreen("link");
  }

  async function signOutAccount() {
    if (accountSession) await customerLogout(accountSession.refreshToken);
    await clearCustomerSession();
    setAccountSession(null);
    setScreen("home");
  }

  async function onSignedIn(session: StoredCustomerSession) {
    await persistAccount(session);
    if (session.activeOrgId) {
      setPortalMode("account");
      setScreen("portal");
      return;
    }
    setScreen("home");
  }

  if (booting) return null;

  if (screen === "portal") {
    if (portalMode === "account" && accountSession?.activeOrgId) {
      return (
        <>
          <PortalScreen
            colors={colors}
            account={{
              orgId: accountSession.activeOrgId,
              session: accountSession,
              onSession: (next) => void persistAccount(next),
            }}
            onBack={() => setScreen("home")}
            onSignOut={() => void signOutAccount()}
          />
          <StatusBar style={scheme === "light" ? "dark" : "light"} />
        </>
      );
    }
    if (portalToken) {
      return (
        <>
          <PortalScreen
            colors={colors}
            token={portalToken}
            onBack={() => setScreen("home")}
            onSignOut={() => void signOutPortal()}
          />
          <StatusBar style={scheme === "light" ? "dark" : "light"} />
        </>
      );
    }
  }

  if (screen === "login") {
    return (
      <>
        <LoginScreen
          colors={colors}
          onBack={() => setScreen("home")}
          onSignedIn={(session) => void onSignedIn(session)}
          onCreateAccount={() => setScreen("signup")}
        />
        <StatusBar style={scheme === "light" ? "dark" : "light"} />
      </>
    );
  }

  if (screen === "signup") {
    return (
      <>
        <SignupScreen colors={colors} onBack={() => setScreen("login")} onSignedIn={(session) => void onSignedIn(session)} />
        <StatusBar style={scheme === "light" ? "dark" : "light"} />
      </>
    );
  }

  if (screen === "link") {
    return (
      <>
        <LinkScreen colors={colors} onBack={() => setScreen("home")} onLinked={(token) => void connectPortal(token)} />
        <StatusBar style={scheme === "light" ? "dark" : "light"} />
      </>
    );
  }

  if (screen === "book") {
    return (
      <>
        <BookScreen colors={colors} onBack={() => setScreen("home")} />
        <StatusBar style={scheme === "light" ? "dark" : "light"} />
      </>
    );
  }

  return (
    <>
      <HomeScreen
        colors={colors}
        hasPortalToken={Boolean(portalToken)}
        hasAccount={Boolean(accountSession)}
        accountName={accountSession?.user.name}
        onOpenPortal={() => {
          if (accountSession?.activeOrgId) {
            setPortalMode("account");
          } else {
            setPortalMode("token");
          }
          setScreen("portal");
        }}
        onEnterLink={() => setScreen("link")}
        onBook={() => setScreen("book")}
        onSignIn={() => setScreen("login")}
        onSignUp={() => setScreen("signup")}
        onSignOutAccount={() => void signOutAccount()}
      />
      <StatusBar style={scheme === "light" ? "dark" : "light"} />
    </>
  );
}
