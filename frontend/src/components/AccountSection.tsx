import { useState } from "react";
import { api, apiErrorMessage, type ApiUser } from "../services/api";

type Props = {
  user: ApiUser;
  onUserChange: (user: ApiUser) => void;
  onLogout: () => void;
};

type Status = { kind: "ok" | "error"; text: string } | null;

/**
 * Profile + password + sign-out. Each part saves on its own, independent of
 * the settings page's theme draft and Save button.
 */
export default function AccountSection({ user, onUserChange, onLogout }: Props) {
  const [displayName, setDisplayName] = useState(user.display_name);
  const [nameStatus, setNameStatus] = useState<Status>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordStatus, setPasswordStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);

  const nameDirty = displayName.trim() !== "" && displayName.trim() !== user.display_name;

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    if (!nameDirty) return;
    setBusy(true);
    try {
      const updated = await api.auth.updateProfile(displayName.trim());
      onUserChange(updated);
      setDisplayName(updated.display_name);
      setNameStatus({ kind: "ok", text: "Saved." });
    } catch (err) {
      setNameStatus({ kind: "error", text: apiErrorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.auth.changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setPasswordStatus({ kind: "ok", text: "Password changed. Other devices were signed out." });
    } catch (err) {
      setPasswordStatus({ kind: "error", text: apiErrorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="settings-section">
      <div className="account-header">
        <span className="account-avatar" aria-hidden>
          {user.display_name.trim().charAt(0).toUpperCase() || "?"}
        </span>
        <div className="account-who">
          <h3>{user.display_name}</h3>
          <p className="settings-hint">Signed in as @{user.username}</p>
        </div>
        <button className="settings-cancel-btn" onClick={onLogout}>
          Sign out
        </button>
      </div>

      <form className="account-form" onSubmit={saveName}>
        <label className="auth-field">
          <span>Display name</span>
          <div className="account-row">
            <input
              className="auth-input"
              value={displayName}
              onChange={(e) => {
                setDisplayName(e.target.value);
                setNameStatus(null);
              }}
              maxLength={60}
            />
            <button className="settings-save-btn" type="submit" disabled={!nameDirty || busy}>
              Save
            </button>
          </div>
        </label>
        {nameStatus && (
          <div className={nameStatus.kind === "ok" ? "account-ok" : "auth-error"}>{nameStatus.text}</div>
        )}
      </form>

      <form className="account-form" onSubmit={savePassword}>
        <span className="account-label">Change password</span>
        {/* Hidden username lets password managers pair the new password with the account. */}
        <input type="text" value={user.username} autoComplete="username" readOnly hidden />
        <div className="account-row">
          <input
            className="auth-input"
            type="password"
            placeholder="Current password"
            value={currentPassword}
            onChange={(e) => {
              setCurrentPassword(e.target.value);
              setPasswordStatus(null);
            }}
            autoComplete="current-password"
          />
          <input
            className="auth-input"
            type="password"
            placeholder="New password"
            value={newPassword}
            onChange={(e) => {
              setNewPassword(e.target.value);
              setPasswordStatus(null);
            }}
            autoComplete="new-password"
          />
          <button
            className="settings-save-btn"
            type="submit"
            disabled={!currentPassword || !newPassword || busy}
          >
            Change
          </button>
        </div>
        {passwordStatus && (
          <div className={passwordStatus.kind === "ok" ? "account-ok" : "auth-error"}>
            {passwordStatus.text}
          </div>
        )}
      </form>
    </section>
  );
}
