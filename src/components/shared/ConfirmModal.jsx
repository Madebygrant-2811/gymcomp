function ConfirmModal({ message, confirmLabel = "Yes, remove", onConfirm, onCancel, isDanger = true }) {
  return (
    <div className="modal-backdrop">
      <div className="modal-box">
        <div style={{ fontSize: 28, marginBottom: 12 }}>{isDanger ? "🗑️" : "⚠️"}</div>
        <div style={{ fontSize: 15, marginBottom: 24, lineHeight: 1.7 }}>{message}</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className={`btn ${isDanger ? "btn-danger" : "btn-warn"}`} onClick={onConfirm}>{confirmLabel}</button>
          <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}


export default ConfirmModal;
