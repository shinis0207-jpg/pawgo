import React from "react";
import { View, Text, StyleSheet } from "react-native";

interface Props {
  children: React.ReactNode;
  fallbackLabel?: string;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // 콘솔에도 남겨 EAS Build 로그에서 확인 가능
    console.warn("[ErrorBoundary]", this.props.fallbackLabel ?? "render error", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <View style={styles.container}>
          <Text style={styles.title}>{this.props.fallbackLabel ?? "Render error"}</Text>
          <Text style={styles.message} numberOfLines={6}>
            {this.state.error.message || String(this.state.error)}
          </Text>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    backgroundColor: "#FEF2F2",
    gap: 8,
  },
  title: {
    fontSize: 14,
    fontWeight: "700",
    color: "#B91C1C",
  },
  message: {
    fontSize: 12,
    color: "#7F1D1D",
    textAlign: "center",
  },
});
