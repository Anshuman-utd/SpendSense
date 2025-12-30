"use client";

import { useState } from 'react';
import { 
  format, 
  addMonths, 
  subMonths, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  eachDayOfInterval, 
  isSameMonth, 
  isSameDay 
} from 'date-fns';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export default function MiniCalendar({ selectedDate, onSelect, onClose }) {
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(currentMonth)),
    end: endOfWeek(endOfMonth(currentMonth))
  });

  const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));
  const prevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));

  const handleDayClick = (day) => {
    onSelect(day);
    // Optional: Close on selection
    // onClose?.(); 
  };

  const handleClear = () => {
    onSelect(null);
  };

  return (
    <div className="p-4 bg-white rounded-xl shadow-xl border border-zinc-200 w-72 text-zinc-900 absolute top-full right-0 mt-2 z-50">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-bold text-sm">
          {format(currentMonth, 'MMMM yyyy')}
        </h2>
        <div className="flex gap-1">
          <button onClick={prevMonth} className="p-1 hover:bg-zinc-100 rounded-lg text-zinc-600">
            <ChevronLeftIcon className="w-4 h-4" />
          </button>
          <button onClick={nextMonth} className="p-1 hover:bg-zinc-100 rounded-lg text-zinc-600">
            <ChevronRightIcon className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 mb-2">
        {WEEKDAYS.map((day, i) => (
          <div key={i} className="text-center text-xs font-medium text-zinc-400 py-1">
            {day}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {days.map((day, dayIdx) => {
          const isSelected = selectedDate && isSameDay(day, selectedDate);
          const isCurrentMonth = isSameMonth(day, currentMonth);
          const isToday = isSameDay(day, new Date());

          return (
            <button
              key={day.toString()}
              onClick={() => handleDayClick(day)}
              className={`
                h-8 w-8 rounded-full flex items-center justify-center text-sm relative
                ${!isCurrentMonth ? 'text-zinc-300' : 'text-zinc-700'}
                ${isSelected ? 'bg-blue-600 text-white hover:bg-blue-700' : 'hover:bg-zinc-100'}
                ${isToday && !isSelected ? 'text-blue-600 font-bold' : ''}
              `}
            >
              {format(day, 'd')}
            </button>
          );
        })}
      </div>

      <div className="flex justify-between mt-4 pt-3 border-t border-zinc-100">
         <button onClick={handleClear} className="text-xs text-blue-500 hover:text-blue-600 font-medium">
            Clear
         </button>
         <button onClick={() => handleDayClick(new Date())} className="text-xs text-blue-500 hover:text-blue-600 font-medium">
            Today
         </button>
      </div>
    </div>
  );
}
