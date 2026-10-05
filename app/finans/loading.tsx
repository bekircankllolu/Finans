// Sayfa geçişinde sunucu verisi gelene kadar anında gösterilen iskelet
function Block({ className }: { className: string }) {
  return <div className={`skeleton rounded-2xl ${className}`} />
}

export default function FinansLoading() {
  return (
    <div aria-busy="true" aria-label="Yükleniyor">
      <div className="mb-6 space-y-2">
        <div className="skeleton h-7 w-48 rounded-lg" />
        <div className="skeleton h-4 w-72 rounded-md" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Block key={i} className="h-[92px]" />
        ))}
      </div>
      <div className="grid lg:grid-cols-3 gap-4 mb-4">
        <Block className="h-80" />
        <Block className="h-80 lg:col-span-2" />
      </div>
      <div className="grid lg:grid-cols-3 gap-4">
        <Block className="h-72 lg:col-span-2" />
        <Block className="h-72" />
      </div>
    </div>
  )
}
