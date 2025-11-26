import React from 'react';

// ButtonGrid: lays out children in a grid of rows x cols
// props:
// - rows (number) default 3
// - cols (number) default 4
// - gapRow (number|string) default 8 (px)
// - gapCol (number|string) default 8 (px)
// - style, className
// children will be placed in grid cells in source order

export default function ButtonGrid({ rows = 3, cols = 4, gapRow = 8, gapCol = 8, children, style = {}, className = '' }) {
  const gridStyle = {
    display: 'grid',
    gridTemplateColumns: `repeat(${cols}, 1fr)`,
    gridAutoRows: 'min-content',
    rowGap: typeof gapRow === 'number' ? `${gapRow}px` : gapRow,
    columnGap: typeof gapCol === 'number' ? `${gapCol}px` : gapCol,
    // margin : "0px 266px"
  };

  // Ensure children array length doesn't exceed grid size; but allow fewer children
  const maxCells = rows * cols;
  const items = React.Children.toArray(children).slice(0, maxCells);

  // If fewer children, we still render them; empty cells remain empty
  return (
    <div className={className} style={gridStyle}>
      {items.map((child, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'center' }}>
          {child}
        </div>
      ))}
      {/* Fill remaining cells with placeholders to preserve layout if needed */}
      {Array.from({ length: Math.max(0, maxCells - items.length) }).map((_, i) => (
        <div key={`empty-${i}`} />
      ))}
    </div>
  );
}
