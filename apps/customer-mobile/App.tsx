// NNACT Customer mobile app — Coursera-inspired service hub for customers.
import { useCallback, useEffect, useState } from "react";
import { Linking, View } from "react-native";
import { StatusBar as ExpoStatusBar } from "expo-status-bar";
import {
  AppSearchModal,
  customerSearchToItems,
  defaultCustomerSuggestions,
  mergeSearchResults,
  searchLocalServices,
  AnimatedScreen,
  TabTransition,
} from "@nnact/mobile-ui";
import { buildGoogleMapsDirectionsUrl, type MobileSearchResultItem } from "@nnact/shared";
import { useTheme } from "./src/theme";
import { EmptyState, LoadingOverlay } from "./src/components/ui";
import {
  clearCustomerSession,
  loadCustomerSession,
  saveCustomerSession,
  type StoredCustomerSession,
} from "./src/auth-storage";
import { customerLogout, customerSearch } from "./src/auth-api";
import { BottomTabBar, type TabId } from "./src/components/BottomTabBar";
import { HomeScreen } from "./src/screens/HomeScreen";
import { WelcomeScreen } from "./src/screens/WelcomeScreen";
import { ServicesScreen } from "./src/screens/ServicesScreen";
import { AccountScreen } from "./src/screens/AccountScreen";
import { BookScreen } from "./src/screens/BookScreen";
import { ActivityScreen } from "./src/screens/ActivityScreen";
import { LoginScreen } from "./src/screens/LoginScreen";
import { SignupScreen } from "./src/screens/SignupScreen";

type Overlay = "login" | "signup" | "book" | null;

export default function App() {
  const { colors, scheme, fonts } = useTheme();
  const [tab, setTab] = useState<TabId>("home");
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [overlayVisible, setOverlayVisible] = useState(false);
  const [bookPrefill, setBookPrefill] = useState<{ service?: string; category?: string }>({});
  const [accountSession, setAccountSession] = useState<StoredCustomerSession | null>(null);
  const [activityBadge, setActivityBadge] = useState(0);
  const [activitySummary, setActivitySummary] = useState<{ estimates?: number; balance?: string }>({});
  const [booting, setBooting] = useState(true);
  const [signingOut, setSigningOut] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const searchFonts = {
    regular: fonts.regular,
    medium: fonts.medium,
    semibold: fonts.semibold,
    bold: fonts.bold,
  };

  const persistAccount = useCallback(async (session: StoredCustomerSession) => {
    await saveCustomerSession(session);
    setAccountSession(session);
  }, []);

  useEffect(() => {
    void loadCustomerSession().then((savedAccount) => {
      setAccountSession(savedAccount);
      setBooting(false);
    });
  }, []);

  function signOut() {
    if (signingOut || !accountSession) return;
    setSigningOut(true);
    const refreshToken = accountSession.refreshToken;

    setAccountSession(null);
    setActivitySummary({});
    setActivityBadge(0);
    setTab("home");

    void (async () => {
      try {
        await clearCustomerSession();
      } finally {
        setSigningOut(false);
      }
      void customerLogout(refreshToken);
    })();
  }

  async function onSignedIn(session: StoredCustomerSession) {
    await persistAccount(session);
    setTab("home");
    setOverlayVisible(false);
  }

  function openBook(service?: string, category?: string) {
    setBookPrefill({ service, category });
    setOverlay("book");
    setOverlayVisible(true);
  }

  function showOverlay(next: Overlay) {
    setOverlay(next);
    setOverlayVisible(true);
  }

  function hideOverlay() {
    setOverlayVisible(false);
  }

  const runCustomerSearch = useCallback(
    async (query: string) => {
      const local = searchLocalServices(query);
      if (!accountSession?.activeOrgId) return local;

      try {
        const remote = await customerSearch(accountSession, accountSession.activeOrgId, query);
        return mergeSearchResults(local, customerSearchToItems(remote));
      } catch {
        return local;
      }
    },
    [accountSession],
  );

  function handleSearchSelect(item: MobileSearchResultItem) {
    switch (item.category) {
      case "service":
        openBook(item.payload?.service, item.payload?.category);
        break;
      case "job":
      case "estimate":
      case "invoice":
        setTab("activity");
        break;
      case "help": {
        const action = item.payload?.action;
        if (action === "book") openBook();
        else if (action === "call" && item.payload?.phone) {
          void Linking.openURL(`tel:${item.payload.phone.replace(/\s/g, "")}`);
        } else if (action === "directions") {
          void Linking.openURL(buildGoogleMapsDirectionsUrl());
        }
        break;
      }
      default:
        break;
    }
  }

  const signedIn = Boolean(accountSession);
  const searchPlaceholder = signedIn ? "Search services & activity" : "Search services";

  const searchProps = {
    onOpenSearch: () => setSearchOpen(true),
    searchPlaceholder,
    searchFonts,
  };

  if (booting) return null;

  if (overlay === "login") {
    return (
      <>
        <AnimatedScreen visible={overlayVisible} onExited={() => setOverlay(null)}>
          <LoginScreen
            colors={colors}
            onBack={hideOverlay}
            onSignedIn={(session) => void onSignedIn(session)}
            onCreateAccount={() => showOverlay("signup")}
          />
        </AnimatedScreen>
        <ExpoStatusBar style={scheme === "light" ? "dark" : "light"} />
      </>
    );
  }

  if (overlay === "signup") {
    return (
      <>
        <AnimatedScreen visible={overlayVisible} onExited={() => setOverlay(null)}>
          <SignupScreen colors={colors} onBack={() => showOverlay("login")} onSignedIn={(session) => void onSignedIn(session)} />
        </AnimatedScreen>
        <ExpoStatusBar style={scheme === "light" ? "dark" : "light"} />
      </>
    );
  }

  if (overlay === "book") {
    return (
      <>
        <AnimatedScreen
          visible={overlayVisible}
          onExited={() => {
            setOverlay(null);
            setBookPrefill({});
          }}
        >
          <BookScreen
            colors={colors}
            onBack={hideOverlay}
            initialService={bookPrefill.service}
            initialCategory={bookPrefill.category}
          />
        </AnimatedScreen>
        <ExpoStatusBar style={scheme === "light" ? "dark" : "light"} />
      </>
    );
  }

  if (!signedIn) {
    return (
      <>
        <WelcomeScreen
          colors={colors}
          onSignIn={() => showOverlay("login")}
          onSignUp={() => showOverlay("signup")}
          onBook={() => openBook()}
          {...searchProps}
        />
        <AppSearchModal
          visible={searchOpen}
          colors={colors}
          fonts={searchFonts}
          placeholder={searchPlaceholder}
          suggestions={defaultCustomerSuggestions()}
          onClose={() => setSearchOpen(false)}
          onSearch={runCustomerSearch}
          onSelect={handleSearchSelect}
        />
        {signingOut ? <LoadingOverlay colors={colors} message="Signing out…" /> : null}
        <ExpoStatusBar style={scheme === "light" ? "dark" : "light"} />
      </>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <TabTransition activeKey={tab}>
        {tab === "home" ? (
          <HomeScreen
            colors={colors}
            accountName={accountSession?.user.name}
            pendingEstimates={activitySummary.estimates}
            outstandingBalance={activitySummary.balance}
            onOpenActivity={() => setTab("activity")}
            onBook={() => openBook()}
            onBrowseServices={() => setTab("services")}
            {...searchProps}
          />
        ) : null}

        {tab === "services" ? (
          <ServicesScreen colors={colors} onBook={(service, category) => openBook(service, category)} {...searchProps} />
        ) : null}

        {tab === "activity" ? (
          accountSession?.activeOrgId ? (
            <ActivityScreen
              colors={colors}
              account={{
                orgId: accountSession.activeOrgId,
                session: accountSession,
                onSession: (next) => void persistAccount(next),
              }}
              onSessionLoaded={(summary) => {
                setActivitySummary({ estimates: summary.estimates, balance: summary.balance ?? undefined });
                setActivityBadge(summary.estimates);
              }}
              {...searchProps}
            />
          ) : (
            <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: "center" }}>
              <EmptyState
                colors={colors}
                icon=""
                title="No workspace yet"
                description="Your account is not linked to a service provider. Contact NNACT support if you expected to see estimates or invoices here."
              />
            </View>
          )
        ) : null}

        {tab === "account" ? (
          <AccountScreen
            colors={colors}
            accountName={accountSession?.user.name}
            accountEmail={accountSession?.user.email}
            onSignIn={() => showOverlay("login")}
            onSignUp={() => showOverlay("signup")}
            onSignOut={signOut}
            signingOut={signingOut}
            {...searchProps}
          />
        ) : null}
      </TabTransition>

      <AppSearchModal
        visible={searchOpen}
        colors={colors}
        fonts={searchFonts}
        placeholder={searchPlaceholder}
        suggestions={defaultCustomerSuggestions()}
        onClose={() => setSearchOpen(false)}
        onSearch={runCustomerSearch}
        onSelect={handleSearchSelect}
      />

      {signingOut ? <LoadingOverlay colors={colors} message="Signing out…" /> : null}

      <BottomTabBar colors={colors} active={tab} onChange={setTab} activityBadge={activityBadge} />
      <ExpoStatusBar style={scheme === "light" ? "dark" : "light"} />
    </View>
  );
}
