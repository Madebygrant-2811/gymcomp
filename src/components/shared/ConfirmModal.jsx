function ConfirmModal({ message, confirmLabel = "Yes, remove", cancelLabel = "Cancel", onConfirm, onCancel, isDanger = true, icon, confirmStyle }) {
  return (
    <div className="modal-backdrop">
      <div className="modal-box">
        <div style={{ fontSize: 28, marginBottom: 12 }}>{icon || (isDanger ? "🗑️" : "⚠️")}</div>
        <div style={{ fontSize: 15, marginBottom: 24, lineHeight: 1.7 }}>{message}</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className={`btn ${isDanger ? "btn-danger" : "btn-warn"}`} style={confirmStyle} onClick={onConfirm}>{confirmLabel}</button>
          <button className="btn btn-secondary" onClick={onCancel}>{cancelLabel}</button>
        </div>
      </div>
    </div>
  );
}


export default ConfirmModal;
