import React from 'react';
import { View, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { theme } from '../theme';
import { useEventsStore } from '../stores/eventsStore';
import { CreatePlanForm } from './CreatePlanForm';
import { formatDateShort } from '../utils/dates';
import type { HomeStackParamList, RootStackParamList } from '../navigation/types';
import { useNavigation, type CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

type NavType = CompositeNavigationProp<
  NativeStackNavigationProp<HomeStackParamList>,
  NativeStackNavigationProp<RootStackParamList>
>;

export const CreatePlanFromEventScreen = ({ route }: { route: any }) => {
  const { eventId } = route.params;
  const events = useEventsStore((s) => s.events);
  const event = events.find((e) => e.id === eventId);
  const navigation = useNavigation<NavType>();

  if (!event) return <View style={s.container} />;

  return (
    <View style={s.container}>
      <CreatePlanForm
        linkedEventId={event.id}
        linkedEventTitle={event.title}
        linkedEventVenue={event.venue?.name}
        linkedEventTime={formatDateShort(event.starts_at)}
        linkedEventStartsAt={event.starts_at}
        onDone={(_planId: string) => {
          (navigation as any).navigate('PlansTab', {
            screen: 'PlanDetails',
            params: { planId: _planId },
          });
        }}
      />
    </View>
  );
};

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
});
