import * as React from "react";
import { Settings, Plus, Edit2, ChevronLeft, ChevronRight, X } from "lucide-react";
import { format, addMonths, subMonths, isSameDay, isToday, getDate, getDaysInMonth, startOfMonth, startOfWeek, endOfMonth, endOfWeek, eachDayOfInterval } from "date-fns";
import { motion, AnimatePresence } from "motion/react";
import "./GlassCalendar.css";

// --- MAIN COMPONENT ---
export const GlassCalendar = ({
    selectedDate: propSelectedDate,
    onDateSelect,
    onClose,
    nutritionData = {}, // { 'yyyy-MM-dd': { calories, status } }
    className = ""
}) => {
    const [currentMonth, setCurrentMonth] = React.useState(propSelectedDate || new Date());
    const [selectedDate, setSelectedDate] = React.useState(propSelectedDate || new Date());
    const [viewMode, setViewMode] = React.useState('monthly'); // 'weekly' or 'monthly'

    // Generate grid days for the monthly view (including padding from prev/next months)
    const gridDays = React.useMemo(() => {
        const monthStart = startOfMonth(currentMonth);
        const monthEnd = endOfMonth(monthStart);
        const startDate = startOfWeek(monthStart);
        const endDate = endOfWeek(monthEnd);

        return eachDayOfInterval({
            start: startDate,
            end: endDate,
        }).map(date => ({
            date,
            isCurrentMonth: date.getMonth() === currentMonth.getMonth(),
            isToday: isToday(date),
            isSelected: isSameDay(date, selectedDate),
            nutrition: nutritionData[format(date, "yyyy-MM-dd")]
        }));
    }, [currentMonth, selectedDate, nutritionData]);

    // Generate horizontal days for weekly view
    const weekDays = React.useMemo(() => {
        const start = startOfWeek(new Date());
        return Array.from({ length: 7 }, (_, i) => {
            const date = new Date(start);
            date.setDate(start.getDate() + i);
            return {
                date,
                isToday: isToday(date),
                isSelected: isSameDay(date, selectedDate),
                nutrition: nutritionData[format(date, "yyyy-MM-dd")]
            };
        });
    }, [selectedDate, nutritionData]);

    const handleDateClick = (date) => {
        setSelectedDate(date);
        onDateSelect?.(date);
    };

    const handlePrevMonth = () => {
        setCurrentMonth(subMonths(currentMonth, 1));
    };

    const handleNextMonth = () => {
        setCurrentMonth(addMonths(currentMonth, 1));
    };

    const getStatusColor = (status) => {
        if (status === 3 || status === 'Healthy') return '#22c55e';
        if (status === 2 || status === 'Moderate') return '#eab308';
        if (status === 1 || status === 'Poor') return '#ef4444';
        return 'transparent';
    };

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className={`glass-calendar-container ${className}`}
        >
            {/* Header: Tabs and Controls */}
            <div className="calendar-header">
                <div className="view-toggle">
                    <button
                        className={`toggle-btn ${viewMode === 'weekly' ? 'active' : ''}`}
                        onClick={() => setViewMode('weekly')}
                    >
                        Weekly
                    </button>
                    <button
                        className={`toggle-btn ${viewMode === 'monthly' ? 'active' : ''}`}
                        onClick={() => setViewMode('monthly')}
                    >
                        Monthly
                    </button>
                </div>
                <div className="header-actions">
                    <button className="icon-btn" title="Settings">
                        <Settings className="h-5 w-5" />
                    </button>
                    {onClose && (
                        <button className="icon-btn close-btn" onClick={onClose}>
                            <X className="h-5 w-5" />
                        </button>
                    )}
                </div>
            </div>

            {/* Date Display and Navigation */}
            <div className="month-nav">
                <AnimatePresence mode="wait">
                    <motion.p
                        key={format(currentMonth, "MMMM yyyy")}
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        transition={{ duration: 0.2 }}
                        className="month-title"
                    >
                        {format(currentMonth, "MMMM")}
                        <span className="year-label">{format(currentMonth, "yyyy")}</span>
                    </motion.p>
                </AnimatePresence>
                <div className="nav-controls">
                    <button onClick={handlePrevMonth} className="nav-btn">
                        <ChevronLeft className="h-5 w-5" />
                    </button>
                    <button onClick={handleNextMonth} className="nav-btn">
                        <ChevronRight className="h-5 w-5" />
                    </button>
                </div>
            </div>

            {/* Calendar Body */}
            <div className="calendar-body">
                {viewMode === 'monthly' ? (
                    <div className="calendar-grid">
                        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(day => (
                            <div key={day} className="weekday-header">{day}</div>
                        ))}
                        {gridDays.map((day, idx) => (
                            <button
                                key={idx}
                                onClick={() => handleDateClick(day.date)}
                                className={`day-cell ${!day.isCurrentMonth ? 'other-month' : ''} ${day.isSelected ? 'selected' : ''}`}
                            >
                                <span className="day-number">{getDate(day.date)}</span>
                                {day.nutrition && (
                                    <div
                                        className="status-dot"
                                        style={{ backgroundColor: getStatusColor(day.nutrition.status || day.nutrition.count) }}
                                    />
                                )}
                                {day.isToday && !day.isSelected && <div className="today-indicator" />}
                            </button>
                        ))}
                    </div>
                ) : (
                    <div className="horizontal-picker">
                        {weekDays.map((day) => (
                            <div key={format(day.date, "yyyy-MM-dd")} className="picker-item">
                                <span className="picker-day-label">{format(day.date, "E").charAt(0)}</span>
                                <button
                                    onClick={() => handleDateClick(day.date)}
                                    className={`picker-day-btn ${day.isSelected ? 'selected' : ''}`}
                                >
                                    {getDate(day.date)}
                                    {day.nutrition && (
                                        <div
                                            className="status-dot-mini"
                                            style={{ backgroundColor: getStatusColor(day.nutrition.status || day.nutrition.count) }}
                                        />
                                    )}
                                    {day.isToday && !day.isSelected && <div className="today-indicator" />}
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

        </motion.div>
    );
};
