'use client';

import React from 'react';
import { 
  BarChart as ReBarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell
} from 'recharts';

const data = [
  { name: 'Mon', value: 40 },
  { name: 'Tue', value: 30 },
  { name: 'Wed', value: 50 },
  { name: 'Thu', value: 45 },
  { name: 'Fri', value: 60 },
  { name: 'Sat', value: 20 },
  { name: 'Sun', value: 15 },
];

export function BarChart() {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ReBarChart
        data={data}
        margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
      >
        <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
        <XAxis 
          dataKey="name" 
          axisLine={false} 
          tickLine={false} 
          tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }}
          dy={10}
        />
        <YAxis 
          hide 
        />
        <Tooltip 
          cursor={{ fill: 'var(--secondary)', opacity: 0.5 }}
          contentStyle={{ 
            backgroundColor: 'var(--card)', 
            borderColor: 'var(--border)',
            borderRadius: '8px',
            fontSize: '12px',
            color: 'var(--foreground)'
          }}
          itemStyle={{ color: 'var(--primary)' }}
        />
        <Bar 
          dataKey="value" 
          radius={[4, 4, 0, 0]}
          barSize={20}
        >
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.value > 40 ? 'var(--primary)' : 'var(--muted-foreground)'} opacity={0.8} />
          ))}
        </Bar>
      </ReBarChart>
    </ResponsiveContainer>
  );
}
