export type TaskStatus = "pending" | "in_progress" | "completed";

export interface TaskEntry {
  number: number;
  title: string;
  status: TaskStatus;
  filePath: string;
}