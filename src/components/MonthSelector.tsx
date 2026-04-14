import React from 'react';
import { usePeriod } from '../contexts/PeriodContext';
import { format, addMonths, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export default function MonthSelector() {
  const { currentDate, setCurrentDate } = usePeriod();

  const handlePrevMonth = () => setCurrentDate(subMonths(currentDate, 1));
  const handleNextMonth = () => setCurrentDate(addMonths(currentDate, 1));

  return (
    <div className="flex items-center justify-between bg-white px-4 py-2 rounded-xl shadow-sm border border-gray-100 w-full sm:w-auto">
      <button
        onClick={handlePrevMonth}
        className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
      >
        <ChevronLeft className="w-5 h-5" />
      </button>
      <span className="font-semibold text-gray-900 min-w-[120px] text-center capitalize">
        {format(currentDate, "MMMM yyyy", { locale: ptBR })}
      </span>
      <button
        onClick={handleNextMonth}
        className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
      >
        <ChevronRight className="w-5 h-5" />
      </button>
    </div>
  );
}
