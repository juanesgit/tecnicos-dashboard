import { create } from 'zustand'

const useTabStore = create((set) => ({
  activeTab: 'encurso',
  setActiveTab: (tab) => set({ activeTab: tab }),
}))

export default useTabStore
