from pydantic import BaseModel, Field


class SessionCreate(BaseModel):
    title: str = Field(min_length=1, max_length=512)
    preferredModel: str | None = None
    student: str | None = Field(default=None, max_length=256)
    subject: str | None = Field(default=None, max_length=256)


class SessionUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=512)
    preferredModel: str | None = None
    student: str | None = Field(default=None, max_length=256)
    subject: str | None = Field(default=None, max_length=256)


class SessionSourceAttach(BaseModel):
    sourceId: str


class ConversationCreate(BaseModel):
    title: str | None = Field(default=None, max_length=512)


class ConversationUpdate(BaseModel):
    title: str = Field(min_length=1, max_length=512)


class ConversationSourcesUpdate(BaseModel):
    sourceIds: list[str]


class SessionMemoryUpdate(BaseModel):
    content: str = Field(max_length=8000)


class SessionMemoryAppend(BaseModel):
    content: str = Field(min_length=1, max_length=8000)


class SourcePaste(BaseModel):
    text: str = Field(min_length=1)
    title: str | None = Field(default=None, max_length=512)
    isReference: bool = False


class SourceUpdate(BaseModel):
    isReference: bool | None = None
    name: str | None = Field(default=None, min_length=1, max_length=512)


class FeedbackDraftUpdate(BaseModel):
    content: str = Field(max_length=32000)


class FeedbackGenerateRequest(BaseModel):
    action: str = Field(default="compose")
    draft: str = Field(default="", max_length=32000)
    instructions: str | None = Field(default=None, max_length=2000)
    model: str
    conversationId: str | None = None
    selection: str | None = None
    sourceIds: list[str] | None = None


class ChatRequest(BaseModel):
    message: str = Field(min_length=1)
    mode: str = "spar"
    model: str
    selection: str | None = None
    chunkId: str | None = None
