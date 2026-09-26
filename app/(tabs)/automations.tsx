import React, { useState } from "react";
import { ScrollView, Text, View, TouchableOpacity, FlatList } from "react-native";
import { ScreenContainer } from "@/components/screen-container";

type Automation = {
  id: string;
  name: string;
  status: "completed" | "running" | "scheduled";
  timestamp: string;
  progress?: number;
};

type TimeTab = "past" | "present" | "future";

const MOCK_AUTOMATIONS = {
  past: [
    { id: "1", name: "Analisi APK", status: "completed" as const, timestamp: "2 ore fa", progress: 100 },
    { id: "2", name: "Scan Forensico", status: "completed" as const, timestamp: "5 ore fa", progress: 100 },
    { id: "3", name: "Export IOC", status: "completed" as const, timestamp: "1 giorno fa", progress: 100 },
  ],
  present: [
    { id: "4", name: "Monitoraggio Rete", status: "running" as const, timestamp: "In corso", progress: 65 },
    { id: "5", name: "Threat Scoring", status: "running" as const, timestamp: "In corso", progress: 42 },
  ],
  future: [
    { id: "6", name: "Logcat Analysis", status: "scheduled" as const, timestamp: "Tra 2 ore", progress: 0 },
    { id: "7", name: "OSINT Lookup", status: "scheduled" as const, timestamp: "Domani 09:00", progress: 0 },
  ],
};

const getStatusColor = (status: string) => {
  switch (status) {
    case "completed":
      return "#22c55e";
    case "running":
      return "#f59e0b";
    case "scheduled":
      return "#6b7280";
    default:
      return "#9ca3af";
  }
};

const getStatusLabel = (status: string) => {
  switch (status) {
    case "completed":
      return "✓ Completato";
    case "running":
      return "⟳ In Esecuzione";
    case "scheduled":
      return "⏱ Programmato";
    default:
      return status;
  }
};

export default function AutomationsScreen() {
  const [activeTab, setActiveTab] = useState<TimeTab>("present");

  const automations = MOCK_AUTOMATIONS[activeTab];

  const renderAutomationItem = ({ item }: { item: Automation }) => (
    <View className="mx-4 mb-3 p-3 bg-surface rounded-lg border border-border">
      <View className="flex-row justify-between items-start mb-2">
        <View className="flex-1">
          <Text className="text-sm font-semibold text-foreground">{item.name}</Text>
          <Text className="text-xs text-muted mt-1">{item.timestamp}</Text>
        </View>
        <View className="px-2 py-1 rounded bg-surface border" style={{ borderColor: getStatusColor(item.status) }}>
          <Text className="text-xs font-bold" style={{ color: getStatusColor(item.status) }}>
            {getStatusLabel(item.status)}
          </Text>
        </View>
      </View>

      {item.progress !== undefined && item.progress > 0 && (
        <View className="w-full h-1 bg-border rounded-full overflow-hidden">
          <View
            className="h-full bg-primary rounded-full"
            style={{ width: `${item.progress}%` }}
          />
        </View>
      )}
    </View>
  );

  return (
    <ScreenContainer className="flex-1 bg-background">
      {/* Header */}
      <View className="px-4 py-3 border-b border-border">
        <Text className="text-lg font-bold text-foreground">Automazioni</Text>
      </View>

      {/* Temporal Tabs */}
      <View className="flex-row gap-2 px-4 py-3 border-b border-border">
        {(["past", "present", "future"] as TimeTab[]).map((tab) => (
          <TouchableOpacity
            key={tab}
            onPress={() => setActiveTab(tab)}
            className={`flex-1 py-2 px-3 rounded-lg border ${
              activeTab === tab ? "bg-primary border-primary" : "bg-surface border-border"
            }`}
          >
            <Text
              className={`text-xs font-semibold text-center ${
                activeTab === tab ? "text-background" : "text-foreground"
              }`}
            >
              {tab === "past" ? "📜 Passato" : tab === "present" ? "⏱ Presente" : "🔮 Futuro"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Automations List */}
      {automations.length > 0 ? (
        <FlatList
          data={automations}
          renderItem={renderAutomationItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingVertical: 8 }}
          scrollEnabled={true}
        />
      ) : (
        <View className="flex-1 items-center justify-center">
          <Text className="text-muted text-sm">Nessuna automazione in questa categoria</Text>
        </View>
      )}

      {/* Add Button */}
      <View className="px-4 py-3 border-t border-border">
        <TouchableOpacity className="w-full py-3 rounded-lg bg-primary items-center">
          <Text className="text-sm font-semibold text-background">+ Nuova Automazione</Text>
        </TouchableOpacity>
      </View>
    </ScreenContainer>
  );
}
