"use client";

import React from "react";
import { BaseEdge, EdgeLabelRenderer, EdgeProps, getBezierPath } from "@xyflow/react";

export function CustomEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  data,
  markerEnd,
}: EdgeProps) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const channel = (data?.channel as string) || "subtask_dispatch";
  const notes = data?.notes as string;

  let strokeColor = "rgb(var(--color-primary))";
  let strokeDasharray = "none";
  let badgeLabel = "Dispatch";
  let badgeColor = "bg-primary/10 text-primary border-primary/20";

  if (channel === "dialectical_review") {
    strokeColor = "#f43f5e"; // Rose / red
    strokeDasharray = "6,4";
    badgeLabel = "Critique / Review";
    badgeColor = "bg-rose-500/10 text-rose-500 border-rose-500/20";
  } else if (channel === "peer_collaboration") {
    strokeColor = "#06b6d4"; // Cyan
    strokeDasharray = "3,3";
    badgeLabel = "Peer Collab";
    badgeColor = "bg-cyan-500/10 text-cyan-500 border-cyan-500/20";
  }

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          stroke: strokeColor,
          strokeWidth: 2,
          strokeDasharray,
        }}
      />
      <EdgeLabelRenderer>
        <div
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: "all",
          }}
          className="nodrag nopan"
        >
          <div
            className={`px-2 py-0.5 rounded-md border text-[9px] font-bold shadow-xs backdrop-blur-xs flex items-center gap-1 ${badgeColor}`}
            title={notes || badgeLabel}
          >
            <span>{badgeLabel}</span>
          </div>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
