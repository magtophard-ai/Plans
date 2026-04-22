import React from 'react';
import { NavigationContainer, createNavigationContainerRef, type LinkingOptions } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Text, StyleSheet, Platform, View, ActivityIndicator } from 'react-native';
import * as Linking from 'expo-linking';
import { useFonts, Unbounded_500Medium, Unbounded_700Bold } from '@expo-google-fonts/unbounded';
import { theme } from './src/theme';
import { useAuthStore } from './src/stores/authStore';
import { AuthScreen } from './src/screens/AuthScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { SearchScreen } from './src/screens/SearchScreen';
import { CreatePlanScreen } from './src/screens/CreatePlanScreen';
import { PlansHubScreen } from './src/screens/PlansHubScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { EventDetailsScreen } from './src/screens/EventDetailsScreen';
import { CreatePlanFromEventScreen } from './src/screens/CreatePlanFromEventScreen';
import { PlanDetailsScreen } from './src/screens/PlanDetailsScreen';
import { GroupDetailsScreen } from './src/screens/GroupDetailsScreen';
import { NotificationsScreen } from './src/screens/NotificationsScreen';
import { VenueScreen } from './src/screens/VenueScreen';
import { PublicPlanScreen } from './src/screens/PublicPlanScreen';
import { PublicProfileScreen } from './src/screens/PublicProfileScreen';
import type { HomeStackParamList, PlansStackParamList, RootStackParamList } from './src/navigation/types';
import { clearPendingJoinToken, extractShareTokenFromUrl, getPendingJoinToken, setPendingJoinToken } from './src/utils/pendingJoin';

const Tab = createBottomTabNavigator();
const HomeStackNav = createNativeStackNavigator<HomeStackParamList>();
const PlansStackNav = createNativeStackNavigator<PlansStackParamList>();
const RootStack = createNativeStackNavigator<RootStackParamList>();

const TabIcon = ({ label, isCreate }: { label: string; isCreate?: boolean }) => {
  if (isCreate) return <Text style={s.createIcon}>+</Text>;
  return <Text style={s.tabIcon}>{label}</Text>;
};

const HomeStack = () => (
  <HomeStackNav.Navigator screenOptions={{ headerShown: false }}>
    <HomeStackNav.Screen name="HomeFeed" component={HomeScreen} />
    <HomeStackNav.Screen name="EventDetails" component={EventDetailsScreen} />
    <HomeStackNav.Screen name="CreatePlanFromEvent" component={CreatePlanFromEventScreen} />
    <HomeStackNav.Screen name="VenueDetails" component={VenueScreen} />
  </HomeStackNav.Navigator>
);

const PlansStack = () => (
  <PlansStackNav.Navigator screenOptions={{ headerShown: false }}>
    <PlansStackNav.Screen name="PlansList" component={PlansHubScreen} />
    <PlansStackNav.Screen name="PlanDetails" component={PlanDetailsScreen} />
    <PlansStackNav.Screen name="GroupDetails" component={GroupDetailsScreen} />
  </PlansStackNav.Navigator>
);

const MainTabs = () => (
  <Tab.Navigator screenOptions={{
    headerShown: false,
    tabBarStyle: Platform.select({
      web: { height: 56, borderTopWidth: 1, borderTopColor: theme.colors.borderLight, maxWidth: 600, alignSelf: 'center', width: '100%' },
      default: { height: 60, borderTopWidth: 1, borderTopColor: theme.colors.borderLight },
    }),
    tabBarLabelStyle: { fontSize: 11, fontWeight: '500' },
    tabBarActiveTintColor: theme.colors.primary,
    tabBarInactiveTintColor: theme.colors.textTertiary,
  }}>
    <Tab.Screen name="HomeTab" component={HomeStack} options={{ tabBarLabel: 'Главная', tabBarIcon: () => <TabIcon label="🏠" /> }} />
    <Tab.Screen name="SearchTab" component={SearchScreen} options={{ tabBarLabel: 'Поиск', tabBarIcon: () => <TabIcon label="🔍" /> }} />
    <Tab.Screen name="CreateTab" component={CreatePlanScreen} options={{ tabBarLabel: '', tabBarIcon: () => <TabIcon label="" isCreate /> }} />
    <Tab.Screen name="PlansTab" component={PlansStack} options={{ tabBarLabel: 'Планы', tabBarIcon: () => <TabIcon label="📋" /> }} />
    <Tab.Screen name="ProfileTab" component={ProfileScreen} options={{ tabBarLabel: 'Профиль', tabBarIcon: () => <TabIcon label="👤" /> }} />
  </Tab.Navigator>
);

const linking: LinkingOptions<RootStackParamList> = {
  prefixes: [Linking.createURL('/'), 'fest://', 'https://plans.app', 'http://localhost:8081'],
  config: {
    screens: {
      PublicPlan: 'p/:token',
      PublicProfile: 'u/:userId',
      Notifications: 'notifications',
      MainTabs: {
        screens: {
          HomeTab: 'home',
          SearchTab: 'search',
          CreateTab: 'create',
          PlansTab: 'plans',
          ProfileTab: 'profile',
        },
      },
    },
  },
};

const navigationRef = createNavigationContainerRef<RootStackParamList>();

const AppNavigator = () => {
  const handleReady = React.useCallback(() => {
    const token = getPendingJoinToken();
    if (!token) return;
    // Clear immediately so a re-render doesn't re-navigate; PublicPlanScreen
    // will handle the actual join and navigate to PlanDetails on success.
    clearPendingJoinToken();
    if (navigationRef.isReady()) navigationRef.navigate('PublicPlan', { token });
  }, []);
  return (
    <NavigationContainer ref={navigationRef} linking={linking} onReady={handleReady}>
      <RootStack.Navigator screenOptions={{ headerShown: false }}>
        <RootStack.Screen name="MainTabs" component={MainTabs} />
        <RootStack.Screen name="Notifications" component={NotificationsScreen} />
        <RootStack.Screen name="PublicPlan" component={PublicPlanScreen} />
        <RootStack.Screen name="PublicProfile" component={PublicProfileScreen} />
      </RootStack.Navigator>
    </NavigationContainer>
  );
};

// When opened unauthenticated via a deep link like fest://p/:token or
// https://…/p/:token, stash the token so we can auto-join right after login.
function usePendingJoinCapture() {
  React.useEffect(() => {
    let cancelled = false;
    Linking.getInitialURL().then((url) => {
      if (cancelled) return;
      const token = extractShareTokenFromUrl(url ?? undefined);
      if (token && !getPendingJoinToken()) setPendingJoinToken(token);
    });
    const sub = Linking.addEventListener('url', ({ url }) => {
      const token = extractShareTokenFromUrl(url);
      if (token && !getPendingJoinToken()) setPendingJoinToken(token);
    });
    return () => { cancelled = true; sub.remove(); };
  }, []);
}

const UnauthenticatedShell = () => {
  usePendingJoinCapture();
  return <AuthScreen />;
};

export default function App() {
  const isAuthenticated = useAuthStore((s: { isAuthenticated: boolean }) => s.isAuthenticated);
  const [fontsLoaded] = useFonts({ Unbounded_500Medium, Unbounded_700Bold });

  if (!fontsLoaded) {
    return (
      <View style={s.fontLoader}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }
  if (!isAuthenticated) return <UnauthenticatedShell />;
  return <AppNavigator />;
}

const s = StyleSheet.create({
  tabIcon: { fontSize: 20 },
  createIcon: { fontSize: 28, fontWeight: '700', color: theme.colors.primary },
  fontLoader: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.background },
});
