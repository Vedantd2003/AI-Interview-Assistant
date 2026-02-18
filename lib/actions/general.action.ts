"use server";
import "server-only";

import { ObjectId } from "mongodb";

import { feedbackSchema } from "@/constants";
import { getDb } from "@/lib/mongodb";

export async function createFeedback(params: CreateFeedbackParams) {
  const { interviewId, userId, transcript, feedbackId } = params;

  try {
    const formattedTranscript = transcript
      .map((sentence: { role: string; content: string }) => `- ${sentence.role}: ${sentence.content}\n`)
      .join("");

    const { generateObject } = await import("ai");
    const { google } = await import("@ai-sdk/google");

    const { object } = await generateObject({
      model: google("gemini-2.0-flash-001"),
      schema: feedbackSchema,
      prompt: `
You are an AI interviewer analyzing a mock interview.

Transcript:
${formattedTranscript}

Score the candidate from 0 to 100 in:
- Communication Skills
- Technical Knowledge
- Problem-Solving
- Cultural & Role Fit
- Confidence & Clarity
      `,
      system:
        "You are a professional interviewer analyzing a mock interview.",
    });

    const db = await getDb();
    const feedback = {
      interviewId,
      userId,
      totalScore: object.totalScore,
      categoryScores: object.categoryScores,
      strengths: object.strengths,
      areasForImprovement: object.areasForImprovement,
      finalAssessment: object.finalAssessment,
      createdAt: new Date().toISOString(),
    };

    if (feedbackId) {
      await db
        .collection("feedback")
        .updateOne({ _id: new ObjectId(feedbackId) }, { $set: feedback }, { upsert: true });
      return { success: true, feedbackId };
    }

    const inserted = await db.collection("feedback").insertOne(feedback);
    return { success: true, feedbackId: inserted.insertedId.toString() };
  } catch (error) {
    console.error("Error saving feedback:", error);
    return { success: false };
  }
}

export async function getInterviewById(id: string): Promise<Interview | null> {
  try {
    const db = await getDb();
    const doc = await db.collection("interviews").findOne({ _id: new ObjectId(id) });
    if (!doc) return null;
    return { id: doc._id.toString(), ...(doc as unknown as Omit<Interview, "id">) };
  } catch {
    return null;
  }
}

export async function getFeedbackByInterviewId(
  params: GetFeedbackByInterviewIdParams
): Promise<Feedback | null> {
  const { interviewId, userId } = params;

  const db = await getDb();
  const doc = await db.collection("feedback").findOne({ interviewId, userId });
  if (!doc) return null;
  return { id: doc._id.toString(), ...(doc as unknown as Omit<Feedback, "id">) };
}

export async function getLatestInterviews(
  params: GetLatestInterviewsParams
): Promise<Interview[]> {
  const { userId, limit = 20 } = params;
  const db = await getDb();

  const docs = await db
    .collection("interviews")
    .find({ finalized: true, userId: { $ne: userId } })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();

  return docs.map((doc) => ({
    id: doc._id.toString(),
    ...(doc as unknown as Omit<Interview, "id">),
  }));
}

export async function getInterviewsByUserId(userId: string): Promise<Interview[]> {
  const db = await getDb();

  const docs = await db
    .collection("interviews")
    .find({ userId })
    .sort({ createdAt: -1 })
    .toArray();

  return docs.map((doc) => ({
    id: doc._id.toString(),
    ...(doc as unknown as Omit<Interview, "id">),
  }));
}
