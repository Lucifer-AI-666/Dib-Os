import React, { useState, useRef, useEffect } from "react";
import {
  ScrollView,
  Text,
  View,
  TouchableOpacity,
  TextInput,
  FlatList,
  StyleSheet,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";

type ShellOutput = {
  id: string;
  type: "command" | "output" | "error";
  content: string;
  timestamp: number;
};

type CommandHistory = {
  command: string;
  timestamp: number;
};

const MOCK_COMMANDS: Record<string, string> = {
  help: "Comandi disponibili:\n  ls - Elenca file\n  pwd - Directory corrente\n  whoami - Utente corrente\n  date - Data e ora\n  clear - Pulisci schermo",
  ls: "divine_nexus/\n  assets/\n  app/\n  components/\n  hooks/\n  lib/\n  server/\n  package.json",
  pwd: "/home/ubuntu/divine_nexus",
  whoami: "ubuntu@divine-nexus",
  date: new Date().toLocaleString("it-IT"),
  clear: "",
  status: "🦂 SCORPION Agent: Online\n📊 Threat Level: NOMINAL\n🔒 Security Status: PROTECTED",
};

export default function ShellScreen() {
  const [output, setOutput] = useState<ShellOutput[]>([
    {
      id: "0",
      type: "output",
      content: "🦂 Divine Nexus Shell v1.0\nDigita 'help' per i comandi disponibili.",
      timestamp: Date.now(),
    },
  ]);
  const [commandInput, setCommandInput] = useState("");
  const [commandHistory, setCommandHistory] = useState<CommandHistory[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const flatListRef = useRef<FlatList>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (output.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [output]);

  const executeCommand = (command: string) => {
    if (!command.trim()) return;

    // Add command to output
    const commandOutput: ShellOutput = {
      id: Date.now().toString(),
      type: "command",
      content: `$ ${command}`,
      timestamp: Date.now(),
    };

    setOutput((prev) => [...prev, commandOutput]);

    // Add to history
    setCommandHistory((prev) => [...prev, { command, timestamp: Date.now() }]);
    setHistoryIndex(-1);

    // Process command
    const cmd = command.toLowerCase().trim();

    if (cmd === "clear") {
      setOutput([]);
      setCommandInput("");
      return;
    }

    const result = MOCK_COMMANDS[cmd] || `Comando non riconosciuto: ${cmd}`;

    const resultOutput: ShellOutput = {
      id: (Date.now() + 1).toString(),
      type: result.includes("error") || result.includes("non riconosciuto") ? "error" : "output",
      content: result,
      timestamp: Date.now(),
    };

    setOutput((prev) => [...prev, resultOutput]);
    setCommandInput("");
  };

  const handleKeyPress = (key: string) => {
    if (key === "Enter") {
      executeCommand(commandInput);
    } else if (key === "ArrowUp") {
      if (historyIndex < commandHistory.length - 1) {
        const newIndex = historyIndex + 1;
        setHistoryIndex(newIndex);
        setCommandInput(commandHistory[commandHistory.length - 1 - newIndex].command);
      }
    } else if (key === "ArrowDown") {
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        setCommandInput(commandHistory[commandHistory.length - 1 - newIndex].command);
      } else if (historyIndex === 0) {
        setHistoryIndex(-1);
        setCommandInput("");
      }
    }
  };

  const renderOutputLine = ({ item }: { item: ShellOutput }) => {
    const isCommand = item.type === "command";
    const isError = item.type === "error";

    return (
      <View className="px-4 py-1">
        <Text
          className="font-mono text-xs"
          style={{
            color: isError ? "#ef4444" : isCommand ? "#ffd700" : "#ecedee",
            fontFamily: "monospace",
          }}
        >
          {item.content}
        </Text>
      </View>
    );
  };

  return (
    <ScreenContainer className="flex-1 bg-black">
      {/* Header */}
      <View className="px-4 py-3 border-b border-border bg-surface">
        <Text className="text-lg font-bold text-foreground">🖥️ Shell CLI</Text>
      </View>

      {/* Output Area */}
      <FlatList
        ref={flatListRef}
        data={output}
        renderItem={renderOutputLine}
        keyExtractor={(item) => item.id}
        className="flex-1"
        contentContainerStyle={{ paddingVertical: 8 }}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
      />

      {/* Input Area */}
      <View className="px-4 py-3 border-t border-border bg-surface gap-2">
        <View className="flex-row items-center gap-2">
          <Text className="text-sm font-mono text-yellow-500">$</Text>
          <TextInput
            value={commandInput}
            onChangeText={setCommandInput}
            placeholder="Digita comando..."
            placeholderTextColor="#6b7280"
            className="flex-1 px-2 py-2 rounded bg-black text-foreground text-sm font-mono"
            onSubmitEditing={() => executeCommand(commandInput)}
            returnKeyType="go"
          />
          <TouchableOpacity
            onPress={() => executeCommand(commandInput)}
            className="px-3 py-2 rounded bg-primary"
          >
            <Text className="text-xs font-bold text-background">⏎</Text>
          </TouchableOpacity>
        </View>

        {/* Clear Button */}
        <TouchableOpacity
          onPress={() => {
            setOutput([]);
            setCommandInput("");
          }}
          className="px-3 py-2 rounded bg-error/10 border border-error"
        >
          <Text className="text-xs font-semibold text-error text-center">🗑️ Pulisci Output</Text>
        </TouchableOpacity>
      </View>
    </ScreenContainer>
  );
}
