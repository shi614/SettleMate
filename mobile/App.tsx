/**
 * Offline-first Expense Splitter
 * @format
 */

import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StatusBar, StyleSheet, View, useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import type { RootStackParamList } from './src/types';
import { GroupListScreen } from './src/screens/GroupListScreen';
import { GroupDetailScreen } from './src/screens/GroupDetailScreen';
import { AddExpenseScreen } from './src/screens/AddExpenseScreen';
import { SettleUpScreen } from './src/screens/SettleUpScreen';
import { initDatabase } from './src/db/database';
import { syncEngine } from './src/sync/syncEngine';

const Stack = createNativeStackNavigator<RootStackParamList>();

function App() {
  const isDarkMode = useColorScheme() === 'dark';
  const [ready, setReady] = useState(false);

  useEffect(() => {
    initDatabase().then(() => {
      syncEngine.start();
      setReady(true);
    });
  }, []);

  if (!ready) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <NavigationContainer>
        <Stack.Navigator initialRouteName="GroupList">
          <Stack.Screen name="GroupList" component={GroupListScreen} options={{ title: 'Expense Splitter' }} />
          <Stack.Screen
            name="GroupDetail"
            component={GroupDetailScreen}
            options={({ route }) => ({ title: route.params.groupName })}
          />
          <Stack.Screen name="AddExpense" component={AddExpenseScreen} options={{ title: 'Add Expense' }} />
          <Stack.Screen name="SettleUp" component={SettleUpScreen} options={{ title: 'Settle Up' }} />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});

export default App;
