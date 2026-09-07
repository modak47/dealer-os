import styles from "@/app/dealer-v4-preview/v4-preview.module.css";

export default function Loading() {
  return <main className={styles.loadingApp}><div className={styles.loadingState} role="status" aria-live="polite"><span />Loading opportunity...</div></main>;
}
