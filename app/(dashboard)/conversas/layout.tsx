export default function ConversasLayout({ children }: { children: React.ReactNode }) {
  // Counteract the p-8 from the dashboard layout to go edge-to-edge
  return (
    <div
      className="flex overflow-hidden"
      style={{ margin: '-2rem', height: '100vh' }}
    >
      {children}
    </div>
  )
}
