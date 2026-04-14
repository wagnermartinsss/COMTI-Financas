import React, { createContext, useContext, useState, ReactNode } from 'react';
import { startOfMonth, endOfMonth } from 'date-fns';

interface PeriodContextType {
  currentDate: Date;
  setCurrentDate: (date: Date) => void;
  startDateISO: string;
  endDateISO: string;
}

const PeriodContext = createContext<PeriodContextType | undefined>(undefined);

export function PeriodProvider({ children }: { children: ReactNode }) {
  const [currentDate, setCurrentDate] = useState(new Date());

  const startDateISO = startOfMonth(currentDate).toISOString();
  const endDateISO = endOfMonth(currentDate).toISOString();

  return (
    <PeriodContext.Provider value={{ currentDate, setCurrentDate, startDateISO, endDateISO }}>
      {children}
    </PeriodContext.Provider>
  );
}

export function usePeriod() {
  const context = useContext(PeriodContext);
  if (context === undefined) {
    throw new Error('usePeriod must be used within a PeriodProvider');
  }
  return context;
}
