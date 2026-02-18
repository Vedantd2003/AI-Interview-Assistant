"use client";

import Image from "next/image";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { vapi, vapiWebToken } from "@/lib/vapi.sdk";
import { interviewer } from "@/constants";
import { createFeedback } from "@/lib/actions/general.action";

enum CallStatus {
  INACTIVE = "INACTIVE",
  CONNECTING = "CONNECTING",
  ACTIVE = "ACTIVE",
  FINISHED = "FINISHED",
}

interface SavedMessage {
  role: "user" | "system" | "assistant";
  content: string;
}

const normalizeEnvValue = (value?: string) =>
  value?.trim().replace(/^[\s'",]+|[\s'",]+$/g, "");

const isPlaceholder = (value?: string) =>
  !value || value.includes("YOUR_") || value.includes("YOUR-");

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;

  if (typeof error === "object" && error !== null) {
    const maybeError = error as {
      message?: string;
      status?: number;
      statusText?: string;
      error?: unknown;
      data?: unknown;
    };

    if (typeof maybeError.message === "string" && maybeError.message.length > 0) {
      return maybeError.message;
    }

    if (typeof maybeError.error === "string" && maybeError.error.length > 0) {
      return maybeError.error;
    }

    if (typeof maybeError.error === "object" && maybeError.error !== null) {
      const nested = maybeError.error as {
        message?: string;
        error?: string;
      };
      if (nested.message) return nested.message;
      if (nested.error) return nested.error;
    }

    if (typeof maybeError.data === "object" && maybeError.data !== null) {
      const nested = maybeError.data as {
        message?: string;
        error?: string;
      };
      if (nested.message) return nested.message;
      if (nested.error) return nested.error;
    }

    if (typeof maybeError.status === "number") {
      return `HTTP ${maybeError.status}${maybeError.statusText ? ` ${maybeError.statusText}` : ""}`;
    }

    try {
      const keys = Object.getOwnPropertyNames(error);
      return keys.length > 0 ? JSON.stringify(error, keys) : "Unknown error object";
    } catch {
      return "Unknown error";
    }
  }

  return String(error);
};

const isMeetingEndedMessage = (message: string) =>
  message.toLowerCase().includes("meeting has ended");

const Agent = ({
  userName,
  userId,
  interviewId,
  feedbackId,
  type,
  questions,
}: AgentProps) => {
  const router = useRouter();
  const [callStatus, setCallStatus] = useState<CallStatus>(CallStatus.INACTIVE);
  const [messages, setMessages] = useState<SavedMessage[]>([]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [lastMessage, setLastMessage] = useState<string>("");

  useEffect(() => {
    const onCallStart = () => {
      setCallStatus(CallStatus.ACTIVE);
    };

    const onCallEnd = () => {
      setCallStatus(CallStatus.FINISHED);
    };

    const onMessage = (message: Message) => {
      if (message.type === "transcript" && message.transcriptType === "final") {
        const newMessage = { role: message.role, content: message.transcript };
        setMessages((prev) => [...prev, newMessage]);
      }
    };

    const onSpeechStart = () => {
      console.log("speech start");
      setIsSpeaking(true);
    };

    const onSpeechEnd = () => {
      console.log("speech end");
      setIsSpeaking(false);
    };

    const onError = (error: unknown) => {
      const errorMessage = getErrorMessage(error);
      if (isMeetingEndedMessage(errorMessage)) {
        // Daily emits this when the call is already closed; treat as normal teardown.
        setCallStatus(CallStatus.FINISHED);
        return;
      }
      console.error("VAPI runtime error:", errorMessage, error);
      toast.error(`VAPI error: ${errorMessage}`);
      setCallStatus(CallStatus.INACTIVE);
    };

    vapi.on("call-start", onCallStart);
    vapi.on("call-end", onCallEnd);
    vapi.on("message", onMessage);
    vapi.on("speech-start", onSpeechStart);
    vapi.on("speech-end", onSpeechEnd);
    vapi.on("error", onError);

    return () => {
      vapi.off("call-start", onCallStart);
      vapi.off("call-end", onCallEnd);
      vapi.off("message", onMessage);
      vapi.off("speech-start", onSpeechStart);
      vapi.off("speech-end", onSpeechEnd);
      vapi.off("error", onError);
    };
  }, []);

  useEffect(() => {
    if (messages.length > 0) {
      setLastMessage(messages[messages.length - 1].content);
    }

    const handleGenerateFeedback = async (messages: SavedMessage[]) => {
      console.log("handleGenerateFeedback");

      const { success, feedbackId: id } = await createFeedback({
        interviewId: interviewId!,
        userId: userId!,
        transcript: messages,
        feedbackId,
      });

      if (success && id) {
        router.push(`/interview/${interviewId}/feedback`);
      } else {
        console.log("Error saving feedback");
        router.push("/");
      }
    };

    if (callStatus === CallStatus.FINISHED) {
      if (type === "generate") {
        router.push("/");
      } else {
        handleGenerateFeedback(messages);
      }
    }
  }, [messages, callStatus, feedbackId, interviewId, router, type, userId]);

  const handleCall = async () => {
    setCallStatus(CallStatus.CONNECTING);

    try {
      if (!vapiWebToken) {
        toast.error("Missing NEXT_PUBLIC_VAPI_WEB_TOKEN in .env.local.");
        setCallStatus(CallStatus.INACTIVE);
        return;
      }

      if (type === "generate") {
        const assistantId = normalizeEnvValue(
          process.env.NEXT_PUBLIC_VAPI_ASSISTANT_ID
        );

        if (isPlaceholder(assistantId)) {
          toast.error(
            "Set NEXT_PUBLIC_VAPI_ASSISTANT_ID in .env.local. Vapi web calls require an assistant id."
          );
          setCallStatus(CallStatus.INACTIVE);
          return;
        }

        await vapi.start(assistantId, {
          variableValues: {
            username: userName,
            userid: userId,
          },
        });
      } else {
        let formattedQuestions = "";
        if (questions) {
          formattedQuestions = questions
            .map((question) => `- ${question}`)
            .join("\n");
        }

        await vapi.start(interviewer, {
          variableValues: {
            questions: formattedQuestions,
          },
        });
      }
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      if (isMeetingEndedMessage(errorMessage)) {
        setCallStatus(CallStatus.FINISHED);
        return;
      }
      console.error("Error starting call:", errorMessage, error);
      toast.error(`Unable to start call: ${errorMessage}`);
      setCallStatus(CallStatus.INACTIVE);
    }
  };

  const handleDisconnect = () => {
    setCallStatus(CallStatus.FINISHED);
    vapi.stop();
  };

  return (
    <>
      <div className="call-view">
        {/* AI Interviewer Card */}
        <div className="card-interviewer">
          <div className="avatar">
            <Image
              src="/ai-avatar.png"
              alt="profile-image"
              width={65}
              height={54}
              className="object-cover"
            />
            {isSpeaking && <span className="animate-speak" />}
          </div>
          <h3>AI Interviewer</h3>
        </div>

        {/* User Profile Card */}
        <div className="card-border">
          <div className="card-content">
            <Image
              src="/user-avatar.png"
              alt="profile-image"
              width={539}
              height={539}
              className="rounded-full object-cover size-[120px]"
            />
            <h3>{userName}</h3>
          </div>
        </div>
      </div>

      {messages.length > 0 && (
        <div className="transcript-border">
          <div className="transcript">
            <p
              key={lastMessage}
              className={cn(
                "transition-opacity duration-500 opacity-0",
                "animate-fadeIn opacity-100"
              )}
            >
              {lastMessage}
            </p>
          </div>
        </div>
      )}

      <div className="w-full flex justify-center">
        {callStatus !== "ACTIVE" ? (
          <button className="relative btn-call" onClick={() => handleCall()}>
            <span
              className={cn(
                "absolute animate-ping rounded-full opacity-75",
                callStatus !== "CONNECTING" && "hidden"
              )}
            />

            <span className="relative">
              {callStatus === "INACTIVE" || callStatus === "FINISHED"
                ? "Call"
                : ". . ."}
            </span>
          </button>
        ) : (
          <button className="btn-disconnect" onClick={() => handleDisconnect()}>
            End
          </button>
        )}
      </div>
    </>
  );
};

export default Agent;
