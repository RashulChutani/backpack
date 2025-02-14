import type {
  CollectionChatData,
  EnrichedInboxDb,
  RemoteUserData,
  SubscriptionType,
} from "@coral-xyz/common";

import { useState, useEffect, useCallback } from "react";

import { CHAT_MESSAGES } from "@coral-xyz/common";
import { createEmptyFriendship } from "@coral-xyz/db";
import {
  useFriendships,
  useGroupCollections,
  useRequestsCount,
  useUser,
  useAvatarUrl,
} from "@coral-xyz/recoil";
import { SignalingManager, useChatsWithMetadata } from "@coral-xyz/tamagui";
import { createStackNavigator } from "@react-navigation/stack";
import { GiftedChat } from "react-native-gifted-chat";
import { v4 as uuidv4 } from "uuid";

import { MessageList } from "~components/Messages";
import { Screen } from "~components/index";

type ChatType =
  | { chatType: "individual"; chatProps: EnrichedInboxDb }
  | { chatType: "collection"; chatProps: CollectionChatData };

const formatDate = (created_at: string) => {
  return !isNaN(new Date(parseInt(created_at, 10)).getTime())
    ? new Date(parseInt(created_at, 10)).getTime()
    : 0;
};

export function ChatListScreen({ navigation }): JSX.Element {
  // const theme = useTheme();
  const { uuid } = useUser();
  const activeChats = useFriendships({ uuid });
  const requestCount = useRequestsCount({ uuid });
  const groupCollections = useGroupCollections({ uuid });

  const getDefaultChats = () => {
    return groupCollections.filter((x) => x.name && x.image) || [];
  };

  const handlePressMessage = (
    roomId: string,
    roomType: SubscriptionType,
    roomName: string,
    remoteUserId?: string,
    remoteUsername?: string
  ) => {
    navigation.navigate("ChatDetail", {
      roomId,
      roomType,
      roomName,
      remoteUserId,
      remoteUsername,
    });
  };

  const allChats: ChatType[] = [
    ...getDefaultChats().map((x) => ({ chatProps: x, chatType: "collection" })),
    ...(activeChats || []).map((x) => ({
      chatProps: x,
      chatType: "individual",
    })),
  ].sort((a, b) =>
    // TODO some of these are last_message_timestamp
    // others are lastMessageTimestamp
    a.last_message_timestamp < b.last_message_timestamp ? -1 : 1
  );

  return (
    <Screen>
      <MessageList
        requestCount={requestCount}
        allChats={allChats}
        onPressRow={handlePressMessage}
      />
    </Screen>
  );
}

export function ChatDetailScreen({ navigation, route }): JSX.Element {
  const { roomType, roomId, remoteUserId, remoteUsername } = route.params;
  const user = useUser();
  const avatarUrl = useAvatarUrl();
  const { chats } = useChatsWithMetadata({
    room: roomId.toString(),
    type: roomType,
  });

  const [messages, setMessages] = useState([]);

  useEffect(() => {
    const _messages = chats.map((x) => {
      return {
        _id: x.client_generated_uuid,
        text: x.message,
        createdAt: formatDate(x.created_at),
        received: x.received,
        sent: true,
        pending: false,
        user: {
          _id: x.uuid,
          name: x.username,
          avatar: x.image,
        },
      };
    });

    setMessages(_messages);
  }, []);

  const onSend = useCallback(
    async (messages = []) => {
      const [message] = messages;
      if (!message) {
        return;
      }

      // @ts-ignore
      const messageText = message?.text;
      const client_generated_uuid = uuidv4();

      if (chats.length === 0 && roomType === "individual") {
        // If it's the first time the user is interacting,
        // create an in memory friendship
        await createEmptyFriendship(user.uuid, remoteUserId || "", {
          last_message_sender: user.uuid,
          last_message_timestamp: new Date().toISOString(),
          last_message: messageText,
          last_message_client_uuid: client_generated_uuid,
          remoteUsername,
          id: roomId,
        });

        SignalingManager.getInstance().onUpdateRecoil({
          type: "friendship",
        });
      }

      SignalingManager.getInstance()?.send({
        type: CHAT_MESSAGES,
        payload: {
          messages: [
            {
              client_generated_uuid,
              message: messageText,
              message_kind: "text",
            },
          ],
          type: roomType,
          room: roomId.toString(),
        },
      });

      setMessages((previousMessages) =>
        GiftedChat.append(previousMessages, messages)
      );
    },
    [chats.length, roomId, roomType, user.uuid, remoteUserId, remoteUsername]
  );

  return (
    <GiftedChat
      messageIdGenerator={() => uuidv4()}
      // renderAvatarOnTop
      // renderUsernameOnMessage
      messages={messages}
      onSend={onSend}
      user={{
        _id: user.uuid,
        name: user.username,
        avatar: avatarUrl,
      }}
    />
  );
}

const Stack = createStackNavigator();
export function ChatNavigator() {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="ChatList"
        component={ChatListScreen}
        options={{ title: "Messages" }}
      />
      <Stack.Screen
        name="ChatDetail"
        component={ChatDetailScreen}
        options={({ route }) => ({ title: route.params.roomName })}
      />
    </Stack.Navigator>
  );
}
