import { NextResponse } from 'next/server';

export async function GET() {
    const csvContent = [
        'Date,Description,Debit,Credit,Balance,Reference',
        '12/11/2024,UPI/SWIGGY/ORDER9821,450.00,,14550.00,UPI12345678',
        '13/11/2024,UBER TRIP BANGALORE,320.00,,14230.00,UBR98765432',
        '14/11/2024,NETFLIX.COM SUBSCRIPTION,649.00,,13581.00,NF11223344',
        '15/11/2024,SALARY CREDIT ACME CORP,,50000.00,63581.00,SAL55667788',
        '16/11/2024,AMAZON PAY RETAIL,1299.00,,62282.00,AMZ99887766',
        '17/11/2024,REFUND SWIGGY ORDER,,120.00,62402.00,REF33445566',
        '18/11/2024,TRANSFER TO SAVINGS A/C,5000.00,,57402.00,TXN77889900'
    ].join('\n');

    return new NextResponse(csvContent, {
        status: 200,
        headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': 'attachment; filename="spendsense_sample_statement.csv"'
        }
    });
}
