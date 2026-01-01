import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import dbConnect from '@/lib/db';
import Expense from '@/models/Expense';
import { authOptions } from '../../auth/[...nextauth]/route';
import mongoose from 'mongoose';

export async function GET(req) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await dbConnect();
        const userId = new mongoose.Types.ObjectId(session.user.id);

        // Fetch all recurring expenses for the user
        // Sort by date descending to get the latest instance first
        const expenses = await Expense.find({
            userId: userId,
            isRecurring: true
        }).sort({ date: -1 });

        // Group by merchant/description to identify unique subscriptions
        // "Active" defined as the most recent entry for that subscription
        const uniqueSubscriptions = {};

        expenses.forEach(expense => {
            // Use merchant as primary key, fallback to description
            // Simplify key: lowercase and trim to handle slight variations
            const key = (expense.merchant || expense.description).toLowerCase().trim();

            if (!uniqueSubscriptions[key]) {
                uniqueSubscriptions[key] = expense;
            }
        });

        const activeSubscriptions = Object.values(uniqueSubscriptions);

        let monthlyTotal = 0;
        let yearlyTotal = 0;
        const upcomingExpenses = [];

        const today = new Date();
        const currentMonth = today.getMonth();
        const currentYear = today.getFullYear();

        let activeCount = 0;

        activeSubscriptions.forEach(sub => {
            if (sub.subscriptionStatus === 'inactive') return;

            activeCount++;

            // Calculate totals
            // Assumption: All recurring expenses stored are "monthly" amounts essentially, 
            // or we trust the 'amount' as the recurring cost.
            // If we had 'frequency', we might adjust, but requirement says "all are monthly"
            monthlyTotal += sub.amount;
            yearlyTotal += (sub.amount * 12);

            // Calculate next payment date
            // Start from the last payment date
            let nextDate = new Date(sub.date);

            // If the last payment was in the past, project forward to upcoming match
            // For simple monthly:
            while (nextDate < today) {
                nextDate.setMonth(nextDate.getMonth() + 1);
            }

            // Check if it falls within "This Month" or specific "Upcoming" logic
            // Requirement: "upcoming recurring expenses of that month according to the date"
            // So we want the payment date for THIS current month (or next if we are at end of month?)
            // Let's explicitly find the payment date for the *current calendar month* to see if it's upcoming or passed
            // actually user said "upcoming recurring expenses of that month"

            // Let's create a date object for this subscription in the CURRENT month
            const paymentDay = new Date(sub.date).getDate();
            let paymentDateInCurrentMonth = new Date(currentYear, currentMonth, paymentDay);

            // If this date has already passed in the current month, maybe show next month? 
            // Or just show it as "upcoming" relative to today?
            // "Upcoming this week" is requested.

            // Let's just collect the *next* occurrence relative to today
            upcomingExpenses.push({
                ...sub.toObject(),
                nextPaymentDate: nextDate
            });
        });

        // Filter upcoming to only show those really coming up soon (e.g. this month)
        // User asked: "upcoming recurring expenses of that month according to the date"
        // And "add a upcoming this week section"
        // Let's return the simplified list sorted by nextPaymentDate
        upcomingExpenses.sort((a, b) => a.nextPaymentDate - b.nextPaymentDate);

        // Identify "This Week" (next 7 days)
        const nextWeek = new Date();
        nextWeek.setDate(today.getDate() + 7);

        const upcomingThisWeek = upcomingExpenses.filter(item =>
            item.nextPaymentDate >= today && item.nextPaymentDate <= nextWeek
        );

        return NextResponse.json({
            success: true,
            data: {
                monthlyTotal,
                yearlyTotal,
                activeCount: activeCount,
                subscriptions: activeSubscriptions,
                upcomingExpenses: upcomingExpenses,  // All upcoming sorted
                upcomingThisWeek: upcomingThisWeek   // Filtered for next 7 days
            }
        });

    } catch (error) {
        console.error('Recurring Expenses Error:', error);
        return NextResponse.json({ success: false, error: 'Server Error' }, { status: 500 });
    }
}
