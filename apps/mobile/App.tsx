// NNACT Pro technician app — Coursera-inspired field operations dashboard.
import { useCallback, useEffect, useState } from "react";
import { Linking, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { AppSearchModal, defaultStaffSuggestions, staffSearchToItems, AnimatedScreen, TabTransition } from "@nnact/mobile-ui";
import type { MobileSearchResultItem } from "@nnact/shared";
import { useTheme } from "./src/theme";
import { clearStaffSession, loadStaffSession, saveStaffSession, type StoredStaffSession } from "./src/auth-storage";
import { staffLogout, staffSearch, staffMe } from "./src/auth-api";
import { BottomTabBar, type TabId } from "./src/components/BottomTabBar";
import { LoadingOverlay } from "./src/components/ui";
import { useFieldData } from "./src/hooks/useFieldData";
import { AuthBootScreen, LoginScreen } from "./src/screens/LoginScreen";
import { ChangePasswordScreen } from "./src/screens/ChangePasswordScreen";
import { WelcomeScreen } from "./src/screens/WelcomeScreen";
import { TodayScreen } from "./src/screens/TodayScreen";
import { JobsScreen } from "./src/screens/JobsScreen";
import { DiagnosticsScreen } from "./src/screens/DiagnosticsScreen";
import { RepairBrainScreen } from "./src/screens/RepairBrainScreen";
import { RepairBrainModelScreen } from "./src/screens/RepairBrainModelScreen";
import { RepairBrainSearchScreen } from "./src/screens/RepairBrainSearchScreen";
import { AccountScreen } from "./src/screens/AccountScreen";
import { JobDetailScreen } from "./src/screens/JobDetailScreen";
import { DiagnosticSessionScreen } from "./src/screens/DiagnosticSessionScreen";
import { StartDiagnosticScreen } from "./src/screens/StartDiagnosticScreen";
import { NotificationsScreen } from "./src/screens/NotificationsScreen";
import { addPushRefreshListener, registerFieldPush } from "./src/push-notifications";

function FieldApp({
  session,
  onSession,
  onSignOut,
  signingOut,
  searchOpen,
  onSearchOpenChange,
  searchPlaceholder,
  searchFonts,
}: {
  session: StoredStaffSession;
  onSession: (next: StoredStaffSession) => void;
  onSignOut: () => void;
  signingOut: boolean;
  searchOpen: boolean;
  onSearchOpenChange: (open: boolean) => void;
  searchPlaceholder: string;
  searchFonts: { regular: string; medium: string; semibold: string; bold: string };
}) {
  const { colors, scheme } = useTheme();
  const [tab, setTab] = useState<TabId>("today");
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [startDiagnostic, setStartDiagnostic] = useState<{
    jobId: string;
    customerId: string;
    title: string;
    description?: string | null;
  } | null>(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notificationsVisible, setNotificationsVisible] = useState(false);
  const [rbBrowse, setRbBrowse] = useState<"browser" | "search" | null>(null);
  const [rbBrowseVisible, setRbBrowseVisible] = useState(false);
  const [rbModelId, setRbModelId] = useState<string | null>(null);
  const [rbModelVisible, setRbModelVisible] = useState(false);
  const [pendingJobId, setPendingJobId] = useState<string | null>(null);
  const [pendingSessionId, setPendingSessionId] = useState<string | null>(null);
  const [jobVisible, setJobVisible] = useState(false);
  const [sessionVisible, setSessionVisible] = useState(false);
  const [startDiagnosticVisible, setStartDiagnosticVisible] = useState(false);
  const field = useFieldData(session, onSession);

  const overlayActive = Boolean(
    showNotifications || selectedSessionId || startDiagnostic || selectedJobId || rbBrowse || rbModelId,
  );

  useEffect(() => {
    void registerFieldPush(session);
    return addPushRefreshListener(() => field.refresh());
  }, [session.accessToken, field.refresh]);

  function openJob(jobId: string) {
    setSelectedSessionId(null);
    setStartDiagnostic(null);
    setStartDiagnosticVisible(false);
    setSessionVisible(false);
    setSelectedJobId(jobId);
    setJobVisible(true);
  }

  function closeJob() {
    setJobVisible(false);
  }

  function openSession(sessionId: string) {
    setSelectedJobId(null);
    setJobVisible(false);
    setStartDiagnostic(null);
    setStartDiagnosticVisible(false);
    setSelectedSessionId(sessionId);
    setSessionVisible(true);
  }

  function closeSession() {
    setSessionVisible(false);
  }

  function beginStartDiagnostic(payload: {
    jobId: string;
    customerId: string;
    title: string;
    description?: string | null;
  }) {
    setSelectedJobId(null);
    setJobVisible(false);
    setSelectedSessionId(null);
    setSessionVisible(false);
    setStartDiagnostic(payload);
    setStartDiagnosticVisible(true);
  }

  function closeStartDiagnostic() {
    setStartDiagnosticVisible(false);
  }

  function openNotifications() {
    setShowNotifications(true);
    setNotificationsVisible(true);
  }

  function closeNotifications() {
    setNotificationsVisible(false);
  }

  function openRepairBrain(mode: "browser" | "search") {
    setRbModelId(null);
    setRbModelVisible(false);
    setRbBrowse(mode);
    setRbBrowseVisible(true);
  }

  function closeRepairBrain() {
    setRbBrowseVisible(false);
  }

  function openRepairBrainModel(modelId: string) {
    setRbBrowse(null);
    setRbBrowseVisible(false);
    setRbModelId(modelId);
    setRbModelVisible(true);
  }

  function closeRepairBrainModel() {
    setRbModelVisible(false);
  }

  const TAB_ORDER: TabId[] = ["today", "jobs", "diagnostics", "account"];

  function switchTab(direction: -1 | 1) {
    setTab((current) => {
      const index = TAB_ORDER.indexOf(current);
      const next = index + direction;
      if (next < 0 || next >= TAB_ORDER.length) return current;
      return TAB_ORDER[next];
    });
  }

  const runStaffSearch = useCallback(
    async (query: string) => {
      const data = await staffSearch(session, query);
      return staffSearchToItems(data);
    },
    [session],
  );

  function handleSearchSelect(item: MobileSearchResultItem) {
    switch (item.category) {
      case "appointment":
      case "help":
        if (item.payload?.action === "today") setTab("today");
        else if (item.payload?.action === "jobs") setTab("jobs");
        else if (item.payload?.action === "diagnostics") setTab("diagnostics");
        else if (item.payload?.action === "call" && item.payload?.phone) {
          void Linking.openURL(`tel:${item.payload.phone.replace(/\s/g, "")}`);
        } else setTab("today");
        break;
      case "job":
        if (item.payload?.jobId) {
          openJob(String(item.payload.jobId));
          onSearchOpenChange(false);
        } else {
          setTab("jobs");
        }
        break;
      case "customer":
      case "invoice":
      case "estimate":
        setTab("jobs");
        break;
      case "equipment":
      case "repair_model":
      case "repair_fault":
      case "repair_part":
      case "repair_procedure":
        setTab("diagnostics");
        break;
      default:
        break;
    }
  }

  const searchProps = {
    onOpenSearch: () => onSearchOpenChange(true),
    searchPlaceholder,
    searchFonts,
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <TabTransition
        activeKey={tab}
        onNextTab={() => switchTab(1)}
        onPreviousTab={() => switchTab(-1)}
      >
        {!overlayActive && tab === "today" ? (
          <TodayScreen
            colors={colors}
            session={session}
            loading={field.loading}
            refreshing={field.refreshing}
            offline={field.offline}
            error={field.error}
            lastSync={field.lastSync}
            queuedWrites={field.queuedWrites}
            todayAppointments={field.todayAppointments}
            activeDiagnostics={field.activeDiagnostics}
            nextAppointment={field.nextAppointment}
            nextJob={field.nextJob ?? undefined}
            nextDiagnostic={field.nextDiagnostic ?? undefined}
            jobs={field.jobs}
            unreadNotifications={field.unreadNotifications}
            onRefresh={field.refresh}
            onOpenDiagnostics={() => setTab("diagnostics")}
            onOpenJobs={() => setTab("jobs")}
            onOpenJob={openJob}
            {...searchProps}
          />
        ) : null}

        {!overlayActive && tab === "jobs" ? (
          <JobsScreen colors={colors} jobs={field.jobs} loading={field.loading} onOpenJob={openJob} {...searchProps} />
        ) : null}

        {!overlayActive && tab === "diagnostics" ? (
          <DiagnosticsScreen
            colors={colors}
            diagnostics={field.diagnostics}
            loading={field.loading}
            onOpenSession={openSession}
            onOpenRepairBrain={() => openRepairBrain("browser")}
            onOpenRepairBrainSearch={() => openRepairBrain("search")}
            {...searchProps}
          />
        ) : null}

        {!overlayActive && tab === "account" ? (
          <AccountScreen
            colors={colors}
            session={session}
            offline={field.offline}
            lastSync={field.lastSync}
            queuedWrites={field.queuedWrites}
            onSignOut={onSignOut}
            signingOut={signingOut}
            onOpenNotifications={openNotifications}
            {...searchProps}
          />
        ) : null}
      </TabTransition>

      {showNotifications ? (
        <AnimatedScreen
          visible={notificationsVisible}
          onDismiss={closeNotifications}
          onExited={() => {
            setShowNotifications(false);
            if (pendingJobId) {
              openJob(pendingJobId);
              setPendingJobId(null);
            }
          }}
        >
          <NotificationsScreen
            colors={colors}
            session={session}
            onBack={closeNotifications}
            onOpenJob={(jobId) => {
              setPendingJobId(jobId);
              closeNotifications();
            }}
            {...searchProps}
          />
        </AnimatedScreen>
      ) : null}

      {selectedSessionId ? (
        <AnimatedScreen
          visible={sessionVisible}
          onDismiss={closeSession}
          onExited={() => setSelectedSessionId(null)}
        >
          <DiagnosticSessionScreen
            colors={colors}
            sessionId={selectedSessionId}
            staffSession={session}
            offline={field.offline}
            syncService={field.getSyncService()}
            onBack={closeSession}
            onCompleted={() => void field.refresh()}
          />
        </AnimatedScreen>
      ) : null}

      {startDiagnostic ? (
        <AnimatedScreen
          visible={startDiagnosticVisible}
          onDismiss={closeStartDiagnostic}
          onExited={() => {
          setStartDiagnostic(null);
          if (pendingSessionId) {
            openSession(pendingSessionId);
            setPendingSessionId(null);
          }
        }}>
          <StartDiagnosticScreen
            colors={colors}
            staffSession={session}
            jobId={startDiagnostic.jobId}
            jobTitle={startDiagnostic.title}
            customerId={startDiagnostic.customerId}
            defaultComplaint={startDiagnostic.description}
            onBack={closeStartDiagnostic}
            onStarted={(sessionId) => {
              setPendingSessionId(sessionId);
              closeStartDiagnostic();
            }}
          />
        </AnimatedScreen>
      ) : null}

      {selectedJobId ? (
        <AnimatedScreen
          visible={jobVisible}
          onDismiss={closeJob}
          onExited={() => setSelectedJobId(null)}
        >
          <JobDetailScreen
            colors={colors}
            jobId={selectedJobId}
            session={session}
            onSession={onSession}
            onBack={closeJob}
            onOpenDiagnosticSession={openSession}
            onStartDiagnostic={(payload) => {
              const job = field.jobs.find((row) => row.id === selectedJobId);
              beginStartDiagnostic({
                jobId: selectedJobId,
                customerId: payload.customerId || job?.customerId || "",
                title: job?.title ?? "Service job",
                description: payload.description ?? job?.description,
              });
            }}
            initialJob={field.jobs.find((job) => job.id === selectedJobId)}
            cachedAppointments={field.appointments}
            cachedDiagnostics={field.diagnostics}
            onJobUpdated={() => void field.refresh()}
          />
        </AnimatedScreen>
      ) : null}

      {rbBrowse ? (
        <AnimatedScreen
          visible={rbBrowseVisible}
          onDismiss={closeRepairBrain}
          onExited={() => setRbBrowse(null)}
        >
          {rbBrowse === "browser" ? (
            <RepairBrainScreen
              colors={colors}
              session={session}
              onBack={closeRepairBrain}
              onOpenModel={openRepairBrainModel}
            />
          ) : (
            <RepairBrainSearchScreen
              colors={colors}
              session={session}
              onBack={closeRepairBrain}
              onOpenModel={openRepairBrainModel}
            />
          )}
        </AnimatedScreen>
      ) : null}

      {rbModelId ? (
        <AnimatedScreen
          visible={rbModelVisible}
          onDismiss={closeRepairBrainModel}
          onExited={() => setRbModelId(null)}
        >
          <RepairBrainModelScreen
            colors={colors}
            session={session}
            modelId={rbModelId}
            onBack={closeRepairBrainModel}
          />
        </AnimatedScreen>
      ) : null}

      <AppSearchModal
        visible={searchOpen}
        colors={colors}
        fonts={searchFonts}
        placeholder={searchPlaceholder}
        suggestions={defaultStaffSuggestions()}
        onClose={() => onSearchOpenChange(false)}
        onSearch={runStaffSearch}
        onSelect={handleSearchSelect}
      />

      {!overlayActive ? (
        <BottomTabBar
          colors={colors}
          active={tab}
          onChange={setTab}
          diagnosticsBadge={field.activeDiagnostics.length}
          notificationBadge={field.unreadNotifications}
        />
      ) : null}
      {signingOut ? <LoadingOverlay colors={colors} message="Signing out…" /> : null}
      <StatusBar style={scheme === "light" ? "dark" : "light"} />
    </View>
  );
}

export default function App() {
  const { colors, scheme, fonts } = useTheme();
  const [session, setSession] = useState<StoredStaffSession | null>(null);
  const [booting, setBooting] = useState(true);
  const [showLogin, setShowLogin] = useState(false);
  const [loginVisible, setLoginVisible] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const searchFonts = {
    regular: fonts.regular,
    medium: fonts.medium,
    semibold: fonts.semibold,
    bold: fonts.bold,
  };

  const searchPlaceholder = session ? "Search jobs & diagnostics" : "Search field tools";

  useEffect(() => {
    void loadStaffSession().then(async (stored) => {
      if (!stored) {
        setBooting(false);
        return;
      }
      try {
        const me = await staffMe(stored.accessToken);
        setSession({
          ...stored,
          user: { ...stored.user, ...me, mustChangePassword: Boolean(me.mustChangePassword) },
        });
      } catch {
        setSession(stored);
      }
      setBooting(false);
    });
  }, []);

  function signOut() {
    if (signingOut || !session) return;
    setSigningOut(true);
    const refreshToken = session.refreshToken;

    setSession(null);
    setShowLogin(false);
    setLoginVisible(false);

    void (async () => {
      try {
        await clearStaffSession();
      } finally {
        setSigningOut(false);
      }
      void staffLogout(refreshToken);
    })();
  }

  const runGuestSearch = useCallback(async (query: string) => {
    const q = query.trim().toLowerCase();
    return defaultStaffSuggestions().filter(
      (item) =>
        item.title.toLowerCase().includes(q) || (item.subtitle?.toLowerCase().includes(q) ?? false),
    );
  }, []);

  function handleGuestSearchSelect(item: MobileSearchResultItem) {
    if (item.payload?.action === "call" && item.payload?.phone) {
      void Linking.openURL(`tel:${item.payload.phone.replace(/\s/g, "")}`);
    } else {
      setShowLogin(true);
      setLoginVisible(true);
    }
  }

  const guestSearchProps = {
    onOpenSearch: () => setSearchOpen(true),
    searchPlaceholder,
    searchFonts,
  };

  if (booting) {
    return (
      <>
        <AuthBootScreen colors={colors} />
        <StatusBar style={scheme === "light" ? "dark" : "light"} />
      </>
    );
  }

  if (showLogin && !session) {
    return (
      <>
        <AnimatedScreen
          visible={loginVisible}
          onDismiss={() => setLoginVisible(false)}
          onExited={() => setShowLogin(false)}
        >
          <LoginScreen
            colors={colors}
            onBack={() => setLoginVisible(false)}
            onSignedIn={async (next) => {
              await saveStaffSession(next);
              setSession(next);
              setLoginVisible(false);
            }}
          />
        </AnimatedScreen>
        <StatusBar style={scheme === "light" ? "dark" : "light"} />
      </>
    );
  }

  if (!session) {
    return (
      <>
        <WelcomeScreen colors={colors} onSignIn={() => { setShowLogin(true); setLoginVisible(true); }} {...guestSearchProps} />

      <AppSearchModal
          visible={searchOpen}
          colors={colors}
          fonts={searchFonts}
          placeholder={searchPlaceholder}
          suggestions={defaultStaffSuggestions()}
          onClose={() => setSearchOpen(false)}
          onSearch={runGuestSearch}
          onSelect={handleGuestSearchSelect}
        />
        {signingOut ? <LoadingOverlay colors={colors} message="Signing out…" /> : null}
        <StatusBar style={scheme === "light" ? "dark" : "light"} />
      </>
    );
  }

  if (session.user.mustChangePassword) {
    return (
      <>
        <ChangePasswordScreen
          colors={colors}
          session={session}
          onComplete={async (next) => {
            await saveStaffSession(next);
            setSession(next);
          }}
        />
        <StatusBar style={scheme === "light" ? "dark" : "light"} />
      </>
    );
  }

  return (
    <FieldApp
      session={session}
      onSession={(next) => void saveStaffSession(next).then(() => setSession(next))}
      onSignOut={signOut}
      signingOut={signingOut}
      searchOpen={searchOpen}
      onSearchOpenChange={setSearchOpen}
      searchPlaceholder={searchPlaceholder}
      searchFonts={searchFonts}
    />
  );
}
