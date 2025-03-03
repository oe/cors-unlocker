
export function Settings() {
  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Settings</h1>
      <div className='flex flex-col'>
        <div>
          <label className='text-slate-800 dark:text-slate-300'>Enable CORS Unlocker</label>
          <div className='text-slate-400 dark:text-slate-500'>Enable CORS Unlocker on all websites</div>
        </div>
      </div>
    </div>
  )
}