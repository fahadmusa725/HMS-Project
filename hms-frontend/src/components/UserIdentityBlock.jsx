import React from 'react';
import { useAuthStore } from '@/store/authStore';
import { Badge } from '@/components/ui/badge';

export function UserIdentityBlock({ showInitialOnly = false, className = '' }) {
  const { user } = useAuthStore();
  
  const name = user?.name || user?.email?.split('@')[0] || 'User';
  const role = user?.role || 'staff';
  const initial = name.charAt(0).toUpperCase();

  const getRoleDisplayName = (r) => {
    const rolesMap = {
      platform_super_admin: 'Super Admin',
      hospital_admin: 'Hospital Admin',
      doctor: 'Doctor',
      receptionist: 'Receptionist',
      nurse: 'Nurse',
      lab_technician: 'Lab Tech',
      pharmacist: 'Pharmacist',
      accountant: 'Accountant',
      patient: 'Patient',
    };
    return rolesMap[r] || r;
  };

  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      {/* Avatar Circle */}
      <div className="h-9 w-9 rounded-xl bg-primary/15 text-primary border border-primary/25 flex items-center justify-center font-bold text-sm shadow-soft-sm shrink-0">
        {initial}
      </div>

      {!showInitialOnly && (
        <div className="flex flex-col min-w-0 text-left">
          <span className="font-semibold text-xs sm:text-sm text-foreground truncate max-w-[130px] leading-tight">
            {name}
          </span>
          <span className="text-[11px] text-muted-foreground font-medium capitalize truncate">
            {getRoleDisplayName(role)}
          </span>
        </div>
      )}
    </div>
  );
}
