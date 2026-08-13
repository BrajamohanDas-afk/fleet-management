import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createVehicle,
  deleteVehicle,
  getVehicles,
  updateVehicle,
} from '../services/vehicles';
import type {
  VehicleCreate,
  VehicleOut,
  VehicleUpdate,
} from '../services/vehicles';
import type { VehicleStatus, VehicleType } from '../types';

export interface UseVehiclesReturn {
  vehicles: VehicleOut[];
  isLoading: boolean;
  error: Error | null;
  search: string;
  setSearch: (value: string) => void;
  statusFilter: VehicleStatus | '';
  setStatusFilter: (value: VehicleStatus | '') => void;
  typeFilter: VehicleType | '';
  setTypeFilter: (value: VehicleType | '') => void;
  createVehicle: {
    mutateAsync: (data: VehicleCreate) => Promise<VehicleOut>;
    isPending: boolean;
  };
  updateVehicle: {
    mutateAsync: (payload: { id: number; data: VehicleUpdate }) => Promise<VehicleOut>;
    isPending: boolean;
  };
  deleteVehicle: {
    mutateAsync: (id: number) => Promise<void>;
    isPending: boolean;
  };
}

export function useVehicles(): UseVehiclesReturn {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<VehicleStatus | ''>('');
  const [typeFilter, setTypeFilter] = useState<VehicleType | ''>('');

  const params = useMemo(
    () => ({
      q: search,
      status: statusFilter,
      type: typeFilter,
    }),
    [search, statusFilter, typeFilter]
  );

  const { data: vehicles = [], isLoading, error } = useQuery({
    queryKey: ['vehicles', params],
    queryFn: () => getVehicles(params),
  });

  const filteredVehicles = useMemo(() => {
    const q = search.trim().toLowerCase();
    return vehicles.filter((vehicle) => {
      const matchesSearch =
        !q ||
        vehicle.registration_no.toLowerCase().includes(q) ||
        vehicle.vehicle_code.toLowerCase().includes(q);

      const matchesStatus =
        !statusFilter || vehicle.latest?.status === statusFilter;

      const matchesType = !typeFilter || vehicle.vehicle_type === typeFilter;

      return matchesSearch && matchesStatus && matchesType;
    });
  }, [vehicles, search, statusFilter, typeFilter]);

  const createMutation = useMutation({
    mutationFn: createVehicle,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      void queryClient.invalidateQueries({ queryKey: ['devices'] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: VehicleUpdate }) =>
      updateVehicle(id, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      void queryClient.invalidateQueries({ queryKey: ['devices'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteVehicle,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      void queryClient.invalidateQueries({ queryKey: ['devices'] });
    },
  });

  return {
    vehicles: filteredVehicles,
    isLoading,
    error,
    search,
    setSearch,
    statusFilter,
    setStatusFilter,
    typeFilter,
    setTypeFilter,
    createVehicle: {
      mutateAsync: createMutation.mutateAsync,
      isPending: createMutation.isPending,
    },
    updateVehicle: {
      mutateAsync: updateMutation.mutateAsync,
      isPending: updateMutation.isPending,
    },
    deleteVehicle: {
      mutateAsync: deleteMutation.mutateAsync,
      isPending: deleteMutation.isPending,
    },
  };
}
