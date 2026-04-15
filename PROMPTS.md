# Epic Vendor Services FAQ Support Copilot — Build Prompts

These are the prompts (user instructions) used to build the Epic Vendor Services FAQ Support Copilot from scratch across a single conversation session.

---

## Prompt 1: Initial Build

> okay, here is what we're doing for this take home assessment. we are gonna build a chat. we're gonna build a chat, an interface that lets you communicate with documentation. we're gonna have an open ai key set up for it. we're gonna have a cloudflare set up for it. okay, so so there it does have a domain and it has that it does have a um it's just accessible by the internet. it has a imessage preview. okay, and i'll send you the details in the specific of what the hell they're gonna have, what's gonna happen there. we're gonna build memory, okay? this is gonna be a server, a dev server that's gonna be hosted on you computer and and you're gonna have to yeah, you're gonna have to put up with it, put up with the traffic. what else can i say now is that the references, we need to have our own clone of the documentation because all the citations that you're gonna do, all the references and sources that you're gonna link are gonna be within our own website, and we're not gonna go back to epic, even though epic's link is in the pdf as you can see in the pdf. please confirm that you can see the pdf because i'm attaching it. okay, i want to be able to have an interface where i can manage the session the session's memory. so maybe right now on the left side, instead of having like next to the next to the send icon in the text box in the chat. on the right side, on the left side, we could have a little like ram icon or memory icon that only activates once there is something memorable in that one. so for example, i was thinking we can have an llm model or part of the llm prompt be hey at all these things. okay, okay, actually respond okay in a professional constructed way, and then respond if any of this, what the user input was, should be memorized. and the way we're gonna do this, i don't know how just write the figure this out. we're gonna write it in third person. the user has a chicken farm. the user is a mechanic. the user's favorite color is blue. okay? and and we're gonna store this temporarily using local storage so that the end user, so that the end user, the device itself has its memory, rather than every session, or rather than tracking it ourselves. yeah, that's pretty much it. so, our license server or light llm server is now located in a new in our mac meeting, so it's new ip. it's through cloudflare still, but yeah, you can retrieve all the models that it has available there. pick one that's like a 4.0 mini or something that's extremely snappy and fast for these applications. okay yeah and then actually the i was thinking you do that for the snappier part for the main chat i do want you to announce somewhere in there saying powered by gpt-4544, right? the latest, the latest frontier model. you can just say that too, like powered by a frontier model. okay. i think i said gpt 5.4 but i didn't get it right. anyways, um you got this.
>
> **Attachments:** Epic Vendor Services FAQ Support Copilot.pdf, photo-1776263165.jpg (mockup)

---

## Prompt 2: Make It Live

> okay, no, i don't want to have to set up anything. can you please already make it live? go to cloudflare and make a fucking subdomain that points to a tunnel that you have already running. okay, no bullshit, just get it done

---

## Prompt 3: Fix 502 Bad Gateway

> bro, can you even curl yourself? i don't know what the hell you put in your website, but you can do your own curls. curl your sorry, your website. like, you're saying that this is a live and all, but i'm not getting no response. cloudflare i'm literally looking at the cloudflare bad bad gateway 502 error.

---

## Prompt 4: UX Fixes (4 issues)

> okay, i just noticed that i'm not able to send two messages one after the other, but in a support chat i also do that. so please refrain from blocking a follow-up message instead of saying frontier model, i actually want you to maybe you can say frontier model, but i want it to be clickable or tappable. if you tap or click on it, it just like loads this little hover tooltip that just says uh the the model itself, the model name. okay, some other issue i had i just was just present is i asked i told it hey i work at chipotle, but i want to reset my password to to access my account and i replied to reach your password please contact your your japanese organization administration and chipola it help desk so i'm not sure why i tra yeah, i guess i'm not sure why i assumed i wanted to reset my chipotle password. anyways, i did ask it after that, after following up. where do i work? right? and it just crashed. it did it did say memory used. so i guess it did pull something from there. but there is no reply in there in the text box. can you fix those real quick? thank you.

---

## Prompt 5: Fix Empty Responses + Add Tests

> i'd love to be able to reset my password so i'm able to access my account. also, tell me more about what epic vendor services are
>
> Copilot
> memory used
> I'm sorry, I wasn't able to generate a response. Please try rephrasing your question.
>
> okay, so this is what i got. let's run some tests that we can run and we can set up before moving forward, just so that we have some basic back and forth before publishing this application

---

## Prompt 6: Architecture Assessment

> Summarize the current implementation status of our chatbot project. Describe the architecture we have now, how we're handling memory or context, and what's missing or not working well. Include any limitations you've observed in generating context-aware responses. I need to assess what components (like RAG or LangChain) might help.

---

## Prompt 7: Implement RAG

> implement real rag for this chatbot without rewriting the whole app.
>
> current state:
> - faq data is fully injected into every prompt
> - chat memory is stored client-side and appended blindly
> - keyword faq search exists but is not used by chat
>
> goal:
> replace full prompt injection with retrieval-based grounding.
>
> tasks:
> 1. chunk faq entries for embedding
> 2. add embeddings + top-k semantic retrieval
> 3. retrieve only relevant faq chunks per user query
> 4. keep last n messages plus rolling summary
> 5. retrieve only relevant memories, not all memories
> 6. validate cited sources against real faq slugs
> 7. keep code simple, minimal deps, explain each file change
>
> return:
> - architecture plan
> - exact files to create/edit
> - code patches
> - env vars needed
> - local test steps
> - fallback path if embeddings fail

---

## Prompt 8: Package & Deploy as Open Repo

> okay that once that's done i need to have okay i need to do i need three things. i need as zip that has the whole fi all everything there. i want you to use the mcv tool that we have for email and to email it to maxmawad at gmail.com. i want you to zip all the prompts that we have, and all pretty much in this thread, number 35, to uh so we can say hey this is this is what i use to uh to build it. also i want you to report the link itself and i want you to hold on move all this if it's not already in its own repo move it move it all into an open repo. and then here's where the problem comes with the api keys, right? let's just issue a new, i think, i don't know if already, but licenses, we should issue a new repo that has $10, sorry, a new api key that has $10 and just leave it there. just literally dump it in there somehow so that someone can clone this and run it fully locally. okay? and then i'll let you know when to delete the repo. because, yeah, we don't want to just leave that hosted out there forever. okay, thank you.
