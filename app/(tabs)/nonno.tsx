import React, { useState } from "react";
import {
  Text,
  View,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";

type Ruling = "approvato" | "confermare" | "negato";

const RULING_STYLE: Record<Ruling, { label: string; color: string; emoji: string }> = {
  approvato: { label: "Approvato", color: "#22c55e", emoji: "✅" },
  confermare: { label: "Conferma richiesta", color: "#f59e0b", emoji: "⚠️" },
  negato: { label: "Negato", color: "#ef4444", emoji: "⛔" },
};

const RISK_LABEL = ["consiglio", "azione", "sistema", "distruttivo"];

export default function NonnoScreen() {
  const colors = useColors();
  const [text, setText] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [showFamily, setShowFamily] = useState(false);

  const familyQuery = trpc.orchestrator.family.useQuery();
  const commandMutation = trpc.orchestrator.command.useMutation();
  const auditQuery = trpc.orchestrator.audit.useQuery({ limit: 10 });

  const handleSubmit = async () => {
    if (!text.trim() || commandMutation.isPending) return;
    await commandMutation.mutateAsync({ text: text.trim(), confirmed });
    setConfirmed(false);
    auditQuery.refetch();
  };

  const result = commandMutation.data;
  const ruling = result?.verdict.ruling as Ruling | undefined;
  const rulingStyle = ruling ? RULING_STYLE[ruling] : null;

  return (
    <ScreenContainer className="flex-1 bg-background">
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-border">
        <View className="flex-row items-center gap-2">
          <Text className="text-lg">🧓</Text>
          <Text className="text-lg font-bold text-foreground">Nonno Saggio</Text>
        </View>
        <TouchableOpacity
          onPress={() => setShowFamily((s) => !s)}
          className="px-3 py-1 rounded-full bg-surface border border-border"
        >
          <Text className="text-xs font-semibold text-foreground">La Famiglia</Text>
        </TouchableOpacity>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, gap: 16 }}>
        <Text className="text-xs text-muted leading-relaxed">
          Ogni comando passa dal Nonno. Nessun membro della famiglia agisce senza il suo
          permesso.
        </Text>

        {/* Family roster */}
        {showFamily && (
          <View className="rounded-xl border border-border bg-surface p-3 gap-2">
            <Text className="text-xs font-bold text-muted mb-1">Membri</Text>
            {familyQuery.isLoading && <ActivityIndicator color={colors.tint} />}
            {familyQuery.data?.members.map((m) => (
              <View key={m.id} className="flex-row items-center justify-between py-1">
                <View className="flex-row items-center gap-2 flex-1">
                  <Text>{m.emoji}</Text>
                  <View className="flex-1">
                    <Text className="text-sm font-semibold text-foreground">{m.name}</Text>
                    <Text className="text-xs text-muted">{m.role}</Text>
                  </View>
                </View>
                <View className="items-end">
                  <Text className="text-xs text-muted">
                    {m.origin === "locale" ? "locale" : "esterno"}
                  </Text>
                  <Text
                    className="text-xs font-semibold"
                    style={{ color: m.status === "attivo" ? "#22c55e" : "#f59e0b" }}
                  >
                    {m.status}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Verdict card */}
        {result && rulingStyle && (
          <View
            className="rounded-xl p-4 gap-2"
            style={{ backgroundColor: rulingStyle.color + "18", borderWidth: 1, borderColor: rulingStyle.color }}
          >
            <View className="flex-row items-center justify-between">
              <Text className="text-sm font-bold" style={{ color: rulingStyle.color }}>
                {rulingStyle.emoji} {rulingStyle.label}
              </Text>
              <Text className="text-xs text-muted">rischio: {RISK_LABEL[result.risk]}</Text>
            </View>
            {result.member && (
              <Text className="text-xs text-foreground">
                Affidato a: {result.member.emoji} {result.member.name}
              </Text>
            )}
            <Text className="text-sm text-foreground leading-relaxed">{result.output}</Text>
            {ruling === "confermare" && (
              <TouchableOpacity
                onPress={async () => {
                  await commandMutation.mutateAsync({ text: text.trim(), confirmed: true });
                  auditQuery.refetch();
                }}
                className="mt-1 px-3 py-2 rounded-lg"
                style={{ backgroundColor: rulingStyle.color }}
              >
                <Text className="text-xs font-bold text-center text-background">
                  Confermo — procedi
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Recent audit */}
        {auditQuery.data && auditQuery.data.entries.length > 0 && (
          <View className="rounded-xl border border-border p-3 gap-1">
            <Text className="text-xs font-bold text-muted mb-1">Registro del Nonno</Text>
            {auditQuery.data.entries.slice(0, 6).map((e, i) => (
              <View key={`${e.commandId}-${i}`} className="flex-row items-center gap-2 py-0.5">
                <Text className="text-xs" style={{ color: RULING_STYLE[e.ruling as Ruling]?.color }}>
                  {RULING_STYLE[e.ruling as Ruling]?.emoji}
                </Text>
                <Text className="text-xs text-muted flex-1" numberOfLines={1}>
                  {e.text}
                </Text>
                <Text className="text-xs text-muted">{e.outcome}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Input */}
      <View className="px-4 py-3 border-t border-border bg-background gap-2">
        <TouchableOpacity
          onPress={() => setConfirmed((c) => !c)}
          className="flex-row items-center gap-2"
        >
          <View
            className="w-5 h-5 rounded border items-center justify-center"
            style={{
              borderColor: confirmed ? colors.tint : colors.border,
              backgroundColor: confirmed ? colors.tint : "transparent",
            }}
          >
            {confirmed && <Text className="text-xs text-background">✓</Text>}
          </View>
          <Text className="text-xs text-muted">
            Confermo in anticipo le azioni con effetti collaterali
          </Text>
        </TouchableOpacity>

        <View className="flex-row items-center gap-2">
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Impartisci un comando alla famiglia..."
            placeholderTextColor={colors.muted}
            className="flex-1 px-4 py-2 rounded-full bg-surface text-foreground text-sm"
            editable={!commandMutation.isPending}
            onSubmitEditing={handleSubmit}
            returnKeyType="send"
          />
          <TouchableOpacity
            onPress={handleSubmit}
            disabled={!text.trim() || commandMutation.isPending}
            className="w-10 h-10 rounded-full bg-primary items-center justify-center"
            style={{ opacity: !text.trim() || commandMutation.isPending ? 0.5 : 1 }}
          >
            {commandMutation.isPending ? (
              <ActivityIndicator size="small" color={colors.background} />
            ) : (
              <Text className="text-lg">🧓</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </ScreenContainer>
  );
}
