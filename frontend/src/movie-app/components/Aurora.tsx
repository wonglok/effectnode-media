// The signature atmosphere: a slow-drifting aurora of tiffany, periwinkle,
// blush and sky behind the frosted-glass interface. Purely decorative and
// pointer-transparent; animation is disabled for users who prefer reduced motion.
export default function Aurora() {
  return (
    <div className="aurora" aria-hidden="true">
      <div className="aurora-blob aurora-blob--tiffany" />
      <div className="aurora-blob aurora-blob--periwinkle" />
      <div className="aurora-blob aurora-blob--blush" />
      <div className="aurora-blob aurora-blob--sky" />
    </div>
  );
}
