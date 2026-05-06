import { create } from "zustand";
import { Pet } from "@/types";
import { petsApi } from "@/services/api";

interface PetState {
  pets: Pet[];
  selectedPet: Pet | null;
  isLoading: boolean;

  fetchPets: () => Promise<void>;
  addPet: (data: Partial<Pet>) => Promise<Pet>;
  updatePet: (id: number, data: Partial<Pet>) => Promise<void>;
  deletePet: (id: number) => Promise<void>;
  selectPet: (pet: Pet | null) => void;
}

export const usePetStore = create<PetState>((set, get) => ({
  pets: [],
  selectedPet: null,
  isLoading: false,

  fetchPets: async () => {
    set({ isLoading: true });
    try {
      const response = await petsApi.list();
      set({ pets: response.data, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  addPet: async (data) => {
    const response = await petsApi.create(data);
    set((state) => ({ pets: [...state.pets, response.data] }));
    return response.data;
  },

  updatePet: async (id, data) => {
    const response = await petsApi.update(id, data);
    set((state) => ({
      pets: state.pets.map((p) => (p.id === id ? response.data : p)),
      selectedPet: state.selectedPet?.id === id ? response.data : state.selectedPet,
    }));
  },

  deletePet: async (id) => {
    await petsApi.delete(id);
    set((state) => ({
      pets: state.pets.filter((p) => p.id !== id),
      selectedPet: state.selectedPet?.id === id ? null : state.selectedPet,
    }));
  },

  selectPet: (pet) => set({ selectedPet: pet }),
}));
