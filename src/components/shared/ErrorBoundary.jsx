import React from "react";

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    const label = this.props.label || "Unknown";
    console.error(`[ErrorBoundary:${label}] caught error:`, error);
    if (info?.componentStack) console.error(`[ErrorBoundary:${label}] component stack:`, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      const isDev = typeof process !== "undefined" && process.env?.NODE_ENV !== "production";
      return (
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          minHeight: 300, padding: 40, textAlign: "center", fontFamily: "'Saans', system-ui, sans-serif"
        }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>Something went wrong</div>
          <p style={{ color: "var(--muted, #909090)", fontSize: 14, maxWidth: 420, lineHeight: 1.6, marginBottom: 8 }}>
            {this.props.label ? `The ${this.props.label} section hit an error.` : "An unexpected error occurred."}
            {" "}Your data is safe — try again or refresh the page.
          </p>
          {isDev && this.state.error && (
            <pre style={{
              background: "var(--surface2, #f0f0f0)", border: "1px solid var(--border, #e4e4e4)",
              borderRadius: 8, padding: "12px 16px", fontSize: 12, color: "#c0392b",
              maxWidth: 540, overflow: "auto", textAlign: "left", marginBottom: 16, whiteSpace: "pre-wrap"
            }}>
              {this.state.error.message || String(this.state.error)}
            </pre>
          )}
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              padding: "10px 24px", borderRadius: 8, border: "none", cursor: "pointer",
              background: "var(--accent, #000dff)", color: "#fff",
              fontFamily: "'Saans', system-ui, sans-serif", fontSize: 14, fontWeight: 600
            }}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
