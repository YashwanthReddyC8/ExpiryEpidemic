export default function SkeletonCard({ className = '', variant = 'card' }) {
  if (variant === 'row') {
    return (
      <tr className={`animate-pulse border-b border-gray-100 ${className}`}>
        <td className="px-4 py-3"><div className="h-4 bg-gray-200 rounded w-32" /></td>
        <td className="px-4 py-3"><div className="h-4 bg-gray-200 rounded w-20" /></td>
        <td className="px-4 py-3"><div className="h-4 bg-gray-200 rounded w-24" /></td>
        <td className="px-4 py-3"><div className="h-4 bg-gray-200 rounded w-16" /></td>
        <td className="px-4 py-3"><div className="h-4 bg-gray-200 rounded w-12" /></td>
        <td className="px-4 py-3"><div className="h-5 bg-gray-200 rounded-full w-20" /></td>
        <td className="px-4 py-3"><div className="flex gap-2"><div className="w-6 h-6 bg-gray-200 rounded" /><div className="w-6 h-6 bg-gray-200 rounded" /></div></td>
      </tr>
    );
  }

  if (variant === 'alert') {
    return (
      <div className={`flex items-start gap-4 p-4 border-b border-gray-100 animate-pulse ${className}`}>
        <div className="w-2.5 h-2.5 rounded-full bg-gray-200 mt-1.5" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-gray-200 rounded w-1/3" />
          <div className="h-4 bg-gray-200 rounded w-2/3" />
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-gray-100 border border-gray-50 rounded-xl animate-pulse ${className}`} />
  );
}
